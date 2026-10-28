import { z } from 'zod'
import { PublicationStatusSchema } from '../status.ts'
import { splitFrontmatter, unclosedFrontmatterLine } from './frontmatter.ts'
import { DECK_URL_MESSAGE, isDeckUrl } from './urls.ts'

/**
 * Single source of truth for a deck's validated config: centralizes validation,
 * derives TS types, coerces numeric Reveal options, and rejects typos in closed
 * enums. Unknown keys pass through (`.catchall`) to keep authoring freedom.
 */

/**
 * Reveal.js options a deck gives to `Reveal.initialize()`. An unknown key
 * passes validation, and `deckRevealOptions` leaves it out.
 */
export const RevealConfigSchema = z
  .object({
    hash: z.boolean().optional(),
    transition: z.string().optional(),
    backgroundTransition: z.string().optional(),
    slideNumber: z.union([z.string(), z.boolean()]).optional(),
    embedded: z.boolean().optional(),
    margin: z.coerce.number().optional(),
    minScale: z.coerce.number().optional(),
    maxScale: z.coerce.number().optional(),
    width: z.coerce.number().optional(),
    height: z.coerce.number().optional(),
    controls: z.boolean().optional(),
    progress: z.boolean().optional(),
    keyboard: z.boolean().optional(),
    touch: z.boolean().optional(),
    loop: z.boolean().optional(),
    fragments: z.boolean().optional(),
    fragmentInURL: z.boolean().optional(),
    help: z.boolean().optional(),
    showNotes: z.boolean().optional(),
    autoPlayMedia: z.boolean().nullable().optional(),
    preloadIframes: z.boolean().nullable().optional(),
    autoSlide: z.coerce.number().optional(),
    view: z.string().optional(),
    navigationMode: z.enum(['default', 'linear', 'grid']).optional(),
    // Print / PDF options (reveal.js `?print-pdf` mode) — see ../render/print.ts.
    pdfMaxPagesPerSlide: z.coerce.number().optional(),
    pdfSeparateFragments: z.boolean().optional(),
  })
  .catchall(z.unknown())

/** Per-heading-level background images. */
export const ThemeBackgroundsSchema = z
  .object({
    h1: z.string().optional(),
    h2: z.string().optional(),
    h3: z.string().optional(),
    default: z.string().optional(),
  })
  .catchall(z.unknown())

export const DeckMetaSchema = z
  .object({
    title: z.string().optional(),
    lang: z.string().optional(),
    /** Free string; existence is checked separately (isKnownTheme) so a CSS-only theme isn't rejected. */
    theme: z.string().optional(),
    parser: z.enum(['heading', 'separator']).optional(),
    /** Root of the live story embeds. */
    storybook: z.string().refine(value => isDeckUrl(value), { message: DECK_URL_MESSAGE }).optional(),
    backgrounds: ThemeBackgroundsSchema.optional(),
    reveal: RevealConfigSchema.optional(),
    /** Code theme: a name from CODE_THEMES, or theme properties with an optional base `theme`. */
    code: z.union([z.string(), z.record(z.string(), z.union([z.string(), z.number()]))]).optional(),
    /** Optional so un-migrated stubs parse; the closed default (`private`) is enforced at resolution, never here. */
    status: PublicationStatusSchema.optional(),
    /** Catalog grouping slug into `presentations/projects.yml`. */
    project: z.string().optional(),
    /** @deprecated legacy alias of `status`. */
    access: z.string().optional(),
    accessPassword: z.string().optional(),
    // Legacy flat Reveal options, kept for backward compatibility.
    transition: z.string().optional(),
    center: z.boolean().optional(),
  })
  .catchall(z.unknown())

/**
 * The frontmatter keys whose addresses the page loads as a frame or an image:
 * the root of the story embeds and the background images.
 */
export const FRONTMATTER_EMBED_KEYS: readonly string[] = ['storybook', 'backgrounds']

export type RevealConfig = z.infer<typeof RevealConfigSchema>

export type ThemeBackgrounds = z.infer<typeof ThemeBackgroundsSchema>
export type DeckMeta = z.infer<typeof DeckMetaSchema>

/**
 * The Reveal options of a deck's frontmatter that `RevealConfigSchema` names.
 * Reveal reads other options too, and one of them, `dependencies`, loads a
 * script.
 */
export function deckRevealOptions(reveal: unknown): Partial<RevealConfig> {
  if (!reveal || typeof reveal !== 'object')
    return {}
  return Object.fromEntries(Object.entries(reveal).filter(([key]) => Object.hasOwn(RevealConfigSchema.shape, key)))
}

export interface ParseResult {
  /** On failure, falls back to the raw input (non-destructive). */
  meta: DeckMeta
  valid: boolean
  issues: string[]
}

/**
 * Non-destructive by default: on failure logs the issues and returns the original
 * object so an in-production deck never goes dark over a bad field. `strict`
 * throws instead (tests/tooling).
 */
export function parseDeckMeta(
  input: unknown,
  options: { strict?: boolean, label?: string } = {},
): ParseResult {
  const result = DeckMetaSchema.safeParse(input ?? {})
  if (result.success)
    return { meta: result.data, valid: true, issues: [] }

  const issues = result.error.issues.map(
    i => `${i.path.join('.') || '(root)'}: ${i.message}`,
  )
  if (options.strict) {
    const where = options.label ? ` for ${options.label}` : ''
    throw new Error(`Invalid deck frontmatter${where}:\n- ${issues.join('\n- ')}`)
  }
  console.warn(
    `[deck-schema] frontmatter validation issues${options.label ? ` (${options.label})` : ''}: ${issues.join('; ')}`,
  )
  return { meta: (input ?? {}) as DeckMeta, valid: false, issues }
}

/** What a deck file brought from elsewhere declares: the deck metadata, with a title. */
const DeckFileSchema = DeckMetaSchema.extend({ title: z.string().trim().min(1) })

/** A refusal of a deck file; `key` is the frontmatter key at fault, empty when the YAML block itself does not parse. */
export interface DeckFileIssue {
  key: string
  message: string
}

export type DeckFileReading
  = | { valid: true, meta: DeckMeta & { title: string } }
    | { valid: false, issues: DeckFileIssue[] }

/** The issues of a file that lacks a valid title alone: a title typed at its import completes it. */
export function onlyTitleMissing(issues: readonly DeckFileIssue[]): boolean {
  return issues.length === 1 && issues[0]!.key === 'title'
}

/**
 * Read the frontmatter of a deck file before it becomes a deck: the block must
 * be closed, the YAML must parse, the values must follow `DeckMetaSchema`, and
 * the file must give its title. The studio's import and its creation dialog both call it.
 */
export function readDeckFile(raw: string): DeckFileReading {
  const unclosed = unclosedFrontmatterLine(raw)
  if (unclosed)
    return { valid: false, issues: [{ key: '', message: `Line ${unclosed}: a heading inside the front matter, which lacks its closing --- line` }] }
  const { data, yamlError } = splitFrontmatter(raw)
  if (yamlError)
    return { valid: false, issues: [{ key: '', message: yamlError }] }
  const result = DeckFileSchema.safeParse(data)
  if (result.success)
    return { valid: true, meta: result.data }
  return {
    valid: false,
    issues: result.error.issues.map(issue => ({ key: issue.path.join('.'), message: issue.message })),
  }
}
