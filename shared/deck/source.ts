import type { NoteSource } from './schema'

/**
 * Framework-agnostic port for obtaining a deck's raw markdown (local storage,
 * CodiMD, HackMD, …). Server provides concrete adapters; tests use in-memory fakes.
 */
export interface ContentSource {
  readonly id: NoteSource | 'file'
  /** Load raw markdown for a ref (slug/alias/noteId), or `null` if unreachable. Caching is internal. */
  load: (ref: string) => Promise<{ raw: string } | null>
}

/** Sources keyed by id, injected into server orchestration. */
export type ContentSources = Partial<Record<ContentSource['id'], ContentSource>>
