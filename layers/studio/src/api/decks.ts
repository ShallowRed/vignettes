import type { PublicationStatus } from '#shared/access'
import type { Fetcher } from './http'

/** Body for creating a deck (draft, opened in the editor). */
export interface CreateDeckInput {
  slug: string
  title: string
  project?: string
  theme?: string
}

/** Body for a deck metadata edit (admin PATCH). `null` clears a column. */
export interface UpdateDeckMetaInput {
  title: string
  status: PublicationStatus
  unlisted: boolean
  project: string | null
  theme: string | null
  alias: string | null
  family: string | null
  variantLabel: string | null
  supersededBy: string | null
  /** Plain password for a semi-private deck, hashed server-side; null clears it. */
  accessPassword?: string | null
}

/** Deck writes. `trash` is a soft-delete (reversible from the corbeille). */
export const deckApi = {
  create: (fetch: Fetcher, body: CreateDeckInput) =>
    fetch('/api/presentations', { method: 'POST', body }),
  updateMeta: (fetch: Fetcher, slug: string, body: UpdateDeckMetaInput) =>
    fetch(`/api/admin/decks/${slug}`, { method: 'PATCH', body }),
  trash: (fetch: Fetcher, slug: string) =>
    fetch(`/api/presentations/${slug}`, { method: 'DELETE' }),
}
