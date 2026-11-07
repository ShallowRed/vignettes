import type { SlideLayout } from './layout.ts'
import type { DeckMeta } from './schema.ts'

/**
 * Deck intermediate representation: parsers (readers) produce a `DeckModel`,
 * renderers (writers) consume it. One normalized model kills live/frozen drift.
 * `Slide` keeps MDC AST nodes as `unknown` to stay framework-free; only
 * renderers interpret them.
 */

/** A single slide produced by a parser. AST fields are renderer-interpreted. */
export interface Slide {
  header?: unknown
  /** Text above the heading (chapter label, context tag). */
  pretitle?: unknown
  /** Text below the heading in an hgroup (section tagline). */
  subtitle?: unknown
  body: unknown
  verticalSlides?: Slide[]
  headingLevel?: string
  /** A `##` slide made of its heading and at most one short paragraph (see `isSectionSlide`). */
  section?: boolean
  /** The image of `:slide-background`. */
  backgroundImage?: string
  /** The settings of `:layout` (see `readLayout`). */
  layout?: SlideLayout
  /** A component of the slide takes the whole slide, so the slide has no header and body split. */
  fullSlide?: boolean
  quicklink?: { text: string, href: string }
  /** A fingerprint of the source text: the renderer keys the slide by it, so a slide keeps its components while its text stays the same. */
  key?: string
}

/**
 * The role of a slide, named by the heading level of its theme surface: `h1`
 * for the title slide, `h2` for a section, `h3` for a content slide. A `##`
 * slide that is not a section is a content slide.
 */
export function surfaceLevel(slide: Pick<Slide, 'headingLevel' | 'section'>): string | undefined {
  return slide.headingLevel === 'h2' && !slide.section ? 'h3' : slide.headingLevel
}

/** The title slide of a deck: the first slide with a heading, else the first slide. */
export function titleSlideIndex(slides: readonly Pick<Slide, 'headingLevel'>[]): number {
  const index = slides.findIndex(slide => slide.headingLevel)
  return index === -1 ? 0 : index
}

export type AssetKind = 'image' | 'iframe' | 'storybook' | 'video'

/** An external asset reference, collected for the renderers' rebasing pass. */
export interface AssetRef {
  kind: AssetKind
  /** URL as authored (root-absolute or remote). */
  url: string
  /** Origin, for debugging (e.g. slide index / layout). */
  origin?: string
}

/** Normalized deck model: the frozen bundle serializes this wholesale. */
export interface DeckModel {
  meta: DeckMeta
  slides: Slide[]
  assets: AssetRef[]
  provenance?: {
    parser: string
    source?: string
  }
}

export const DECK_MODEL_VERSION = 1

interface SerializedDeckModel {
  version: number
  model: DeckModel
}

export function serializeDeckModel(model: DeckModel): string {
  const payload: SerializedDeckModel = { version: DECK_MODEL_VERSION, model }
  return JSON.stringify(payload)
}

/** Tolerates both the wrapped and bare shapes. */
export function parseDeckModel(json: string): DeckModel {
  const parsed = JSON.parse(json) as SerializedDeckModel | DeckModel
  if (parsed && typeof parsed === 'object' && 'version' in parsed && 'model' in parsed)
    return (parsed as SerializedDeckModel).model
  return parsed as DeckModel
}
