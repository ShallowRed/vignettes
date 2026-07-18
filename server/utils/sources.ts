import type { ContentSource, NoteSource } from '#shared/deck'
import { createDbContent } from '../db/content-store'
import { fetchCollaborativeNote } from './codimd'
import { useDb } from './db'
import { readPresentationContent } from './presentations'

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

/** The database-backed content ports (published versions). */
export function useDbContent() {
  return createDbContent(useDb())
}

/**
 * Published deck markdown: the database version when one exists, else the
 * committed file — the transition chain that lets decks migrate one publish at
 * a time with no bulk seed.
 */
export const publishedSource: ContentSource = {
  id: 'db',
  async load(slug) {
    return await useDbContent().source.load(slug) ?? await fileSource.load(slug)
  },
}
