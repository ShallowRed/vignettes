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

/** The two ways of cutting a deck into slides, the default one first. */
export const ParserIdSchema = z.enum(['separator', 'heading'])

export type ParserId = z.infer<typeof ParserIdSchema>

/** How the deck's text is read, nested under `syntax:`. */
export const SyntaxConfigSchema = z
  .object({
    /** The lines that open a slide: `---` and `----` (`separator`), or the headings (`heading`). */
    split: ParserIdSchema.optional(),
  })
  .catchall(z.unknown())

/**
 * The bloc marque of the French state in the header of the slides, nested
 * under `brand:`. The theme's manifest and the deck's frontmatter both set it,
 * the deck's keys winning; `brand: false` in a deck removes the theme's. A
 * theme built on `@vignettes/theme-dsfr` draws it.
 */
export const DeckBrandSchema = z
  .object({
    /** The lines of the official title, `République française` by default: a list, or one line. */
    ministry: z.union([z.string(), z.array(z.string())]).optional(),
    /** Address of the operator's logo, shown beside the bloc marque. */
    operator: z.string().optional(),
    /** Text alternative of the operator's logo: the operator's name. */
    operatorAlt: z.string().optional(),
    /** The slides that show it: the title slide (`cover`) or every slide (`all`). */
    slides: z.enum(['cover', 'all']).optional(),
    /** The version on a dark background: in white (`white`) or in color on a white plate (`color`). */
    onDark: z.enum(['white', 'color']).optional(),
  })
  .catchall(z.unknown())

export type DeckBrand = z.infer<typeof DeckBrandSchema>

/**
 * `false`, or the keys of `DeckBrandSchema`. An issue of a key keeps its path,
 * `brand.slides`, so the editor marks its line.
 */
const BrandFieldSchema = z.custom<false | DeckBrand>(() => true).superRefine((value, ctx) => {
  if (value === false)
    return
  const result = DeckBrandSchema.safeParse(value)
  for (const issue of result.error?.issues ?? [])
    ctx.addIssue({ ...issue })
})

export const DeckMetaSchema = z
  .object({
    title: z.string().optional(),
    lang: z.string().optional(),
    /** Free string; existence is checked separately (isKnownTheme) so a CSS-only theme isn't rejected. */
    theme: z.string().optional(),
    syntax: SyntaxConfigSchema.optional(),
    /** Root of the live story embeds. */
    storybook: z.string().refine(value => isDeckUrl(value), { message: DECK_URL_MESSAGE }).optional(),
    backgrounds: ThemeBackgroundsSchema.optional(),
    brand: BrandFieldSchema.optional(),
    reveal: RevealConfigSchema.optional(),
    /** Code theme: a name from CODE_THEMES, or theme properties with an optional base `theme`. */
    code: z.union([z.string(), z.record(z.string(), z.union([z.string(), z.number()]))]).optional(),
    /** Optional so un-migrated stubs parse; the closed default (`private`) is enforced at resolution, never here. */
    status: PublicationStatusSchema.optional(),
    /** Catalog grouping slug into `presentations/projects.yml`. */
    project: z.string().optional(),
    /** @deprecated legacy alias of `status`. */
    access: z.string().optional(),
    /** @deprecated legacy alias of `syntax.split`. */
    parser: ParserIdSchema.optional(),
    accessPassword: z.string().optional(),
  })
  .catchall(z.unknown())

/**
 * The frontmatter keys whose addresses the page loads as a frame or an image:
 * the root of the story embeds, the background images and the operator's logo.
 */
export const FRONTMATTER_EMBED_KEYS: readonly string[] = ['storybook', 'backgrounds', 'brand']

export type RevealConfig = z.infer<typeof RevealConfigSchema>

export type SyntaxConfig = z.infer<typeof SyntaxConfigSchema>

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

/**
 * The nature of a refusal of a deck file: a block without its closing line, a
 * YAML block that does not parse, a missing or empty title, an address the
 * deck refuses, or another value outside its schema.
 */
export type DeckFileIssueReason = 'unclosed' | 'unreadable' | 'no-title' | 'address' | 'value'

/** The types a `value` refusal may expect. */
export type DeckFileExpectedType = 'number' | 'boolean' | 'string'

export const DECK_FILE_EXPECTED_TYPES: readonly string[] = ['number', 'boolean', 'string'] satisfies DeckFileExpectedType[]

/** A refusal of a deck file; `key` is the frontmatter key at fault, empty when the block itself is refused. */
export interface DeckFileIssue {
  key: string
  reason: DeckFileIssueReason
  /** The parser's or the schema's message, in English. */
  message: string
  /** For a `value` refusal, the type the key takes, when the schema gives it. */
  expected?: DeckFileExpectedType
  /** For a `value` refusal, the values the key takes, when the schema gives them. */
  values?: string[]
}

export type DeckFileReading
  = | { valid: true, meta: DeckMeta & { title: string } }
    | { valid: false, issues: DeckFileIssue[] }

/** The issues of a file that lacks a valid title alone: a title typed at its import completes it. */
export function onlyTitleMissing(issues: readonly DeckFileIssue[]): boolean {
  return issues.length === 1 && issues[0]!.key === 'title'
}

function schemaIssue(issue: z.core.$ZodIssue, data: Record<string, unknown>): DeckFileIssue {
  const key = issue.path.join('.')
  const { message } = issue
  const title = data.title
  if (key === 'title' && (title == null || (typeof title === 'string' && !title.trim())))
    return { key, reason: 'no-title', message }
  if (message === DECK_URL_MESSAGE)
    return { key, reason: 'address', message }
  if (issue.code === 'invalid_type' && DECK_FILE_EXPECTED_TYPES.includes(issue.expected))
    return { key, reason: 'value', message, expected: issue.expected as DeckFileExpectedType }
  if (issue.code === 'invalid_value')
    return { key, reason: 'value', message, values: issue.values.map(String) }
  return { key, reason: 'value', message }
}

/**
 * Read the frontmatter of a deck file before it becomes a deck: the block must
 * be closed, the YAML must parse, the values must follow `DeckMetaSchema`, and
 * the file must give its title. The studio's import and its creation dialog both call it.
 */
export function readDeckFile(raw: string): DeckFileReading {
  const unclosed = unclosedFrontmatterLine(raw)
  if (unclosed)
    return { valid: false, issues: [{ key: '', reason: 'unclosed', message: `Line ${unclosed}: a heading inside the front matter, which lacks its closing --- line` }] }
  const { data, yamlError } = splitFrontmatter(raw)
  if (yamlError)
    return { valid: false, issues: [{ key: '', reason: 'unreadable', message: yamlError }] }
  const result = DeckFileSchema.safeParse(data)
  if (result.success)
    return { valid: true, meta: result.data }
  return { valid: false, issues: result.error.issues.map(issue => schemaIssue(issue, data)) }
}
