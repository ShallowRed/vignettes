import type { CreateDeckInput, DeckDraftSource, DeckMetaPatch, DuplicateDeckInput } from '#shared/presentations'
import type { Fetcher } from './http'

/** Deck reads and writes. `trash` is a soft-delete (reversible from the corbeille). */
export const deckApi = {
  duplicate: (fetch: Fetcher, slug: string, body: DuplicateDeckInput) =>
    fetch(`/api/presentations/${slug}/duplicate`, { method: 'POST', body }),
  create: (fetch: Fetcher, body: CreateDeckInput) =>
    fetch('/api/presentations', { method: 'POST', body }),
  updateMeta: (fetch: Fetcher, slug: string, body: DeckMetaPatch) =>
    fetch(`/api/admin/decks/${slug}`, { method: 'PATCH', body }),
  trash: (fetch: Fetcher, slug: string) =>
    fetch(`/api/presentations/${slug}`, { method: 'DELETE' }),
  /** The working draft, or the published text when there is none, with the publication state. */
  loadDraft: (fetch: Fetcher, slug: string) =>
    fetch<DeckDraftSource>(`/api/presentations/${slug}`, { query: { draft: '' } }),
  /**
   * `stamp` is the draft stamp the editor loaded: the server refuses the save
   * (409) when the draft changed since. `publishedVersion` is the version it
   * loaded with it.
   */
  saveDraft: (fetch: Fetcher, slug: string, body: { raw: string, stamp: number | null, publishedVersion: number | null }) =>
    fetch<{ stamp?: number | null }>(`/api/presentations/${slug}`, { method: 'PUT', body }),
  publish: (fetch: Fetcher, slug: string) =>
    fetch(`/api/presentations/${slug}/publish`, { method: 'POST' }),
}
