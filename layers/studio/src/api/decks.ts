import type { CreateDeckInput, DeckMetaPatch, DuplicateDeckInput } from '#shared/presentations'
import type { Fetcher } from './http'

/** Deck writes. `trash` is a soft-delete (reversible from the corbeille). */
export const deckApi = {
  duplicate: (fetch: Fetcher, slug: string, body: DuplicateDeckInput) =>
    fetch(`/api/presentations/${slug}/duplicate`, { method: 'POST', body }),
  create: (fetch: Fetcher, body: CreateDeckInput) =>
    fetch('/api/presentations', { method: 'POST', body }),
  updateMeta: (fetch: Fetcher, slug: string, body: DeckMetaPatch) =>
    fetch(`/api/admin/decks/${slug}`, { method: 'PATCH', body }),
  trash: (fetch: Fetcher, slug: string) =>
    fetch(`/api/presentations/${slug}`, { method: 'DELETE' }),
}
