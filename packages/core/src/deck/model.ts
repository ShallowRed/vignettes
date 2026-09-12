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
  backgroundImage?: string
  layout?: string
  /** Extra props for the layout (e.g. media src/type). */
  layoutProps?: Record<string, string>
  quicklink?: { text: string, href: string }
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
