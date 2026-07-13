import type { Slide } from './model'
import type { DeckMeta } from './schema'

/**
 * Framework-agnostic parser contract. Implementations (heading, separator) depend
 * on the MDC runtime and live in `src/utils/slide-ast.ts`.
 */
export type ParserId = 'heading' | 'separator'

export interface DeckParser {
  /** Matches the deck's `meta.parser`. */
  readonly id: ParserId
  /** Parse raw markdown (+ resolved meta) into slides. May be async (MDC). */
  parse: (raw: string, meta: DeckMeta) => Slide[] | Promise<Slide[]>
}

/** Defaults to the heading parser. */
export function parserIdFor(meta: Pick<DeckMeta, 'parser'>): ParserId {
  return meta.parser === 'separator' ? 'separator' : 'heading'
}
