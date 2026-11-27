import type { ImageType } from '../media.ts'
import type { ImagePath, TextPlace } from './images.ts'
import type { LayoutMention } from './layout.ts'
import type { LegacyMention } from './legacy-forms.ts'
import type { AttributeMention, ComponentAttributeIssue, ComponentMention, MalformedAttributes } from './mentions.ts'
import type { OpenBlock } from './scan.ts'
import type { DeckFileIssue } from './schema.ts'
import { MAX_MEDIA_BYTES } from '../media.ts'
import { isKnownTheme } from '../theme/tokens.ts'
import { deckComponentNamed } from './components.ts'
import { frontmatterKeyLines, splitFrontmatter, unclosedFrontmatterLine } from './frontmatter.ts'
import { deckImageSources, leftImagePaths, unreadImagePaths } from './images.ts'
import { layoutMentions } from './layout.ts'
import { legacyMentions } from './legacy-forms.ts'
import { attributeMentions, componentAttributeIssues, componentMentions, malformedAttributeMentions, unclosedBlocks, writtenComponentNames } from './mentions.ts'
import { readDeckFile } from './schema.ts'
import { DeckWriteError, isDeckSlug, MAX_JSON_BODY_BYTES, prepareDeckWrite } from './source.ts'

/**
 * An error breaks or drops content, a warning changes what the author probably
 * meant, an info asks for a cleanup without effect on the slide.
 */
export type DeckProblemSeverity = 'error' | 'warning' | 'info'

/** A place in the text of a deck: 1-based line, 0-based column, length on the line. */
interface Place {
  line: number
  column: number
  length: number
}

/**
 * A refusal of `readDeckFile`, placed on the line of its key, else on the
 * heading of a block without its closing line, else on the line where the YAML
 * parser stops, else on the first line.
 */
export type FrontmatterProblem = DeckFileIssue & Place

/** A theme that the themes of this repository leave out: an instance may publish it. */
export interface UnknownTheme extends Place {
  theme: string
}

/** A problem of the text of a deck, by the check that finds it, placed on its line. */
export type DeckProblem
  = | (MalformedAttributes & { check: 'malformed', severity: DeckProblemSeverity })
    | (ComponentAttributeIssue & { check: 'component-attribute', severity: DeckProblemSeverity })
    | (OpenBlock & { check: 'unclosed', severity: DeckProblemSeverity })
    | (AttributeMention & { check: 'refused', severity: DeckProblemSeverity })
    | (LayoutMention & { check: 'layout', severity: DeckProblemSeverity })
    | (LegacyMention & { check: 'legacy', severity: DeckProblemSeverity })
    | (FrontmatterProblem & { check: 'frontmatter', severity: DeckProblemSeverity })
    | (ComponentMention & { check: 'unknown-component', severity: DeckProblemSeverity })
    | (UnknownTheme & { check: 'unknown-theme', severity: DeckProblemSeverity })
    | (ImagePath & { check: 'image-missing', severity: DeckProblemSeverity })
    | (ImagePath & { check: 'image-outside-deck', severity: DeckProblemSeverity })
    | (ImagePath & { check: 'image-unreadable', severity: DeckProblemSeverity })
    | (ImagePath & { check: 'image-type', severity: DeckProblemSeverity })
    | (ImagePath & { check: 'image-too-large', severity: DeckProblemSeverity, bytes: number })
    | (ImagePath & { check: 'image-source-other', severity: DeckProblemSeverity })
    | (ImagePath & { check: 'image-unread', severity: DeckProblemSeverity })
    | (ImagePath & { check: 'image-not-replaced', severity: DeckProblemSeverity })
    | (ImagePath & { check: 'image-unplaced', severity: DeckProblemSeverity })
    | (Place & { check: 'deck-empty', severity: DeckProblemSeverity })
    | (Place & { check: 'deck-too-long', severity: DeckProblemSeverity })
    | (Place & { check: 'deck-body-too-large', severity: DeckProblemSeverity, bytes: number })

/**
 * The checks of `checkDeckFiles` and `checkDeckWrite`, on the files of a deck
 * and on the text the command line sends to an instance; the editor finds none.
 */
export const DECK_FILE_CHECKS = ['image-missing', 'image-outside-deck', 'image-unreadable', 'image-type', 'image-too-large', 'image-source-other', 'image-unread', 'image-not-replaced', 'image-unplaced', 'deck-empty', 'deck-too-long', 'deck-body-too-large'] as const satisfies readonly DeckProblem['check'][]

const LAYOUT_SEVERITIES: Record<LayoutMention['kind'], DeckProblemSeverity> = {
  'unknown-attribute': 'warning',
  'invalid-value': 'warning',
  'missing-source': 'error',
  'unused': 'info',
  'behind-needs-image': 'error',
}

/** The public name of each problem, by its check, and by its case for a layout. */
export const PROBLEM_CODES: Record<Exclude<DeckProblem['check'], 'layout'>, string> & { layout: Record<LayoutMention['kind'], string> } = {
  'malformed': 'malformed',
  'component-attribute': 'component-attribute',
  'unclosed': 'unclosed',
  'refused': 'refused',
  'layout': {
    'unknown-attribute': 'layout-unknown-attribute',
    'invalid-value': 'layout-invalid-value',
    'missing-source': 'layout-missing-source',
    'unused': 'layout-unused',
    'behind-needs-image': 'layout-behind-needs-image',
  },
  'legacy': 'legacy',
  'frontmatter': 'frontmatter',
  'unknown-component': 'unknown-component',
  'unknown-theme': 'unknown-theme',
  'image-missing': 'image-missing',
  'image-outside-deck': 'image-outside-deck',
  'image-unreadable': 'image-unreadable',
  'image-type': 'image-type',
  'image-too-large': 'image-too-large',
  'image-source-other': 'image-source-other',
  'image-unread': 'image-unread',
  'image-not-replaced': 'image-not-replaced',
  'image-unplaced': 'image-unplaced',
  'deck-empty': 'deck-empty',
  'deck-too-long': 'deck-too-long',
  'deck-body-too-large': 'deck-body-too-large',
}

export function problemCode(problem: DeckProblem): string {
  return problem.check === 'layout' ? PROBLEM_CODES.layout[problem.kind] : PROBLEM_CODES[problem.check]
}

/**
 * The place of a frontmatter key, by its dotted path: the line of the key, or
 * of its nearest parent written on a line of its own.
 */
function keyPlace(raw: string, key: string): Place | undefined {
  const lines = frontmatterKeyLines(raw)
  for (let path = key ? key.split('.') : []; path.length; path = path.slice(0, -1)) {
    const found = lines.find(line => line.path.join('.') === path.join('.'))
    if (found)
      return { line: found.line, column: found.column, length: found.length }
  }
  return undefined
}

function frontmatterProblems(raw: string): FrontmatterProblem[] {
  const reading = readDeckFile(raw)
  if (reading.valid)
    return []
  const line = unclosedFrontmatterLine(raw) ?? splitFrontmatter(raw).yamlErrorLine ?? 1
  const blockPlace = { line, column: 0, length: raw.split(/\r?\n/)[line - 1]!.length }
  return reading.issues.map(issue => ({ ...issue, ...(keyPlace(raw, issue.key) ?? blockPlace) }))
}

function unknownThemes(raw: string): UnknownTheme[] {
  const { theme } = splitFrontmatter(raw).data
  const place = keyPlace(raw, 'theme')
  return typeof theme === 'string' && place && !isKnownTheme(theme) ? [{ theme, ...place }] : []
}

/**
 * The problems found in the text of a deck alone, in the order of the text.
 */
export function checkDeck(raw: string): DeckProblem[] {
  const unknown = writtenComponentNames(raw).filter(name => !deckComponentNamed(name))
  const problems: DeckProblem[] = [
    ...frontmatterProblems(raw).map(problem => ({ ...problem, check: 'frontmatter' as const, severity: 'error' as const })),
    ...unknownThemes(raw).map(theme => ({ ...theme, check: 'unknown-theme' as const, severity: 'info' as const })),
    ...malformedAttributeMentions(raw).map(mention => ({ ...mention, check: 'malformed' as const, severity: 'error' as const })),
    ...componentAttributeIssues(raw).map(issue => ({ ...issue, check: 'component-attribute' as const, severity: 'warning' as const })),
    ...unclosedBlocks(raw).map(block => ({ ...block, check: 'unclosed' as const, severity: 'error' as const })),
    ...attributeMentions(raw).map(mention => ({ ...mention, check: 'refused' as const, severity: 'error' as const })),
    ...layoutMentions(raw).map(mention => ({ ...mention, check: 'layout' as const, severity: LAYOUT_SEVERITIES[mention.kind] })),
    ...legacyMentions(raw).map(mention => ({ ...mention, check: 'legacy' as const, severity: 'info' as const })),
    ...componentMentions(raw, unknown).map(mention => ({ ...mention, check: 'unknown-component' as const, severity: 'warning' as const })),
  ]
  return problems.sort((a, b) => a.line - b.line || a.column - b.column)
}

/**
 * What the command line read of the file of a local image source: absent,
 * outside the folder of the deck, unreadable (not a file, or a file it has no
 * right to read), or its weight and the accepted type its bytes show.
 */
export type LocalImageFact
  = | { state: 'missing' }
    | { state: 'outside' }
    | { state: 'unreadable' }
    | { state: 'read', bytes: number, type?: ImageType }

/**
 * The problems of the image sources of a deck, from the facts the command line
 * read for each local source, by its path (`classifyImageSource`).
 */
export function checkDeckFiles(raw: string, facts: ReadonlyMap<string, LocalImageFact>): DeckProblem[] {
  const problems: DeckProblem[] = []
  for (const { value, source, placed, line, column, length } of deckImageSources(raw)) {
    const place = { value, line, column, length }
    if (source.kind === 'other') {
      problems.push({ ...place, check: 'image-source-other', severity: 'warning' })
      continue
    }
    if (source.kind !== 'local')
      continue
    if (!placed)
      problems.push({ ...place, check: 'image-unplaced', severity: 'error' })
    const fact = facts.get(source.path)
    if (fact?.state === 'missing')
      problems.push({ ...place, check: 'image-missing', severity: 'error' })
    else if (fact?.state === 'outside')
      problems.push({ ...place, check: 'image-outside-deck', severity: 'error' })
    else if (fact?.state === 'unreadable')
      problems.push({ ...place, check: 'image-unreadable', severity: 'error' })
    else if (fact && fact.bytes > MAX_MEDIA_BYTES)
      problems.push({ ...place, check: 'image-too-large', severity: 'error', bytes: fact.bytes })
    else if (fact && !fact.type)
      problems.push({ ...place, check: 'image-type', severity: 'error' })
  }
  for (const path of unreadImagePaths(raw))
    problems.push({ ...path, check: 'image-unread', severity: 'warning' })
  return problems.sort((a, b) => a.line - b.line || a.column - b.column)
}

// The largest values a save of the command line adds to the text: a stamp and
// a version as long as a safe integer, and a digest.
const LARGEST_SAVE = { stamp: Number.MAX_SAFE_INTEGER, publishedVersion: Number.MAX_SAFE_INTEGER, draftDigest: '0'.repeat(64) }

/**
 * The problems of the text the command line sends to an instance: the
 * relative paths of images it keeps, outside those `image-unread` reports on
 * the same line and the places `withImageSources` gives in `left`, whose
 * sources `checkDeckFiles` reports; the refusals of `prepareDeckWrite` but
 * that of the slug, which `push` checks itself; and a JSON body of the
 * creation or of the save larger than `MAX_JSON_BODY_BYTES`.
 */
export function checkDeckWrite(sent: string, { slug, project, left = [] }: { slug: string, project?: string, left?: readonly TextPlace[] }): DeckProblem[] {
  const firstLine = { line: 1, column: 0, length: sent.split('\n')[0]!.replace(/\r$/, '').length }
  const problems: DeckProblem[] = []
  const reported = [...unreadImagePaths(sent), ...left]
  for (const path of leftImagePaths(sent)) {
    if (!reported.some(other => other.line === path.line && other.column <= path.column && path.column < other.column + other.length))
      problems.push({ ...path, check: 'image-not-replaced', severity: 'warning' })
  }
  try {
    prepareDeckWrite({ slug: isDeckSlug(slug) ? slug : 'deck', raw: sent })
  }
  catch (error) {
    if (!(error instanceof DeckWriteError))
      throw error
    if (error.reason === 'empty')
      problems.push({ ...firstLine, check: 'deck-empty', severity: 'error' })
    if (error.reason === 'too-long')
      problems.push({ ...firstLine, check: 'deck-too-long', severity: 'error' })
  }
  const bodies = [{ slug, raw: sent, ...(project === undefined ? {} : { project }) }, { raw: sent, ...LARGEST_SAVE }]
  const bytes = Math.max(...bodies.map(body => new TextEncoder().encode(JSON.stringify(body)).length))
  if (bytes > MAX_JSON_BODY_BYTES)
    problems.push({ ...firstLine, check: 'deck-body-too-large', severity: 'error', bytes })
  return problems.sort((a, b) => a.line - b.line || a.column - b.column)
}
