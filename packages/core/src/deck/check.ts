import type { LayoutMention } from './layout.ts'
import type { LegacyMention } from './legacy-forms.ts'
import type { AttributeMention, ComponentAttributeIssue, ComponentMention, MalformedAttributes } from './mentions.ts'
import type { OpenBlock } from './scan.ts'
import type { DeckFileIssue } from './schema.ts'
import { isKnownTheme } from '../theme/tokens.ts'
import { deckComponentNamed } from './components.ts'
import { frontmatterKeyLines, splitFrontmatter, unclosedFrontmatterLine } from './frontmatter.ts'
import { layoutMentions } from './layout.ts'
import { legacyMentions } from './legacy-forms.ts'
import { attributeMentions, componentAttributeIssues, componentMentions, malformedAttributeMentions, unclosedBlocks, writtenComponentNames } from './mentions.ts'
import { readDeckFile } from './schema.ts'

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

/** A refusal of `readDeckFile`, placed on the line of its key, else on the heading of a block without its closing line, else on the first line. */
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
  const line = unclosedFrontmatterLine(raw) ?? 1
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
