import { z } from 'zod'
import { PublicationStatusSchema } from '../status.ts'

/**
 * Single source of truth for a deck's validated config: centralizes validation,
 * derives TS types, coerces numeric Reveal options, and rejects typos in closed
 * enums. Unknown keys pass through (`.catchall`) to keep authoring freedom.
 */

/** Reveal.js options forwarded to `Reveal.initialize()`. Loose by design. */
export const RevealConfigSchema = z
  .object({
    hash: z.boolean().optional(),
    center: z.boolean().optional(),
    transition: z.string().optional(),
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
    storybook: z.string().optional(),
    backgrounds: ThemeBackgroundsSchema.optional(),
    reveal: RevealConfigSchema.optional(),
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

export type RevealConfig = z.infer<typeof RevealConfigSchema>
export type ThemeBackgrounds = z.infer<typeof ThemeBackgroundsSchema>
export type DeckMeta = z.infer<typeof DeckMetaSchema>

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
