import type { ContentSource, ContentWriter, NoteSource } from '#shared/deck'
import { prepareDeckWrite } from '#shared/deck'
import { fetchCollaborativeNote } from './codimd'
import { findPresentationBySlug, readPresentationContent, writePresentationContentAt } from './presentations'

/**
 * Server adapters implementing the `ContentSource` port — the only place that
 * knows how to reach each provider. Adding a source is one adapter here.
 */

export const codimdSource: ContentSource = {
  id: 'codimd',
  async load(noteId) {
    const raw = await fetchCollaborativeNote('codimd', noteId)
    return raw == null ? null : { raw }
  },
}

export const hackmdSource: ContentSource = {
  id: 'hackmd',
  async load(noteId) {
    const raw = await fetchCollaborativeNote('hackmd', noteId)
    return raw == null ? null : { raw }
  },
}

export const fileSource: ContentSource = {
  id: 'file',
  async load(slug) {
    const result = await readPresentationContent(slug)
    return result == null ? null : { raw: result.content }
  },
}

/** Pick the collaborative-note adapter for a provider. */
export function noteSource(source: NoteSource): ContentSource {
  return source === 'hackmd' ? hackmdSource : codimdSource
}

/**
 * The write side of the `file` source. Symmetric to `fileSource`: persists a
 * deck's markdown back to `presentations/`, keeping the markdown as the source
 * of truth. Existing decks are updated in place (whatever key they live at);
 * new decks land flat. Path safety is enforced by the pure `prepareDeckWrite`
 * before any I/O.
 */
export const fileWriter: ContentWriter = {
  id: 'file',
  async save(input) {
    const prepared = prepareDeckWrite(input)
    const existing = await findPresentationBySlug(prepared.slug)
    const key = existing?.key ?? prepared.key
    const bytes = await writePresentationContentAt(key, prepared.raw)
    return { key, bytes }
  },
}
