import type { PublicationStatus } from '#shared/access'
import type { Fetcher } from './http'

/**
 * Body for creating a deck (draft, opened in the editor): from a template, with
 * the title and theme typed in the dialog, or from a file whose frontmatter
 * gives them.
 */
export type CreateDeckInput
  = | { slug: string, title: string, project?: string, theme?: string, template?: string }
    | { slug: string, raw: string, project?: string }

/** Body for a deck metadata edit (admin PATCH). `null` clears a column. */
export interface UpdateDeckMetaInput {
  status: PublicationStatus
  unlisted: boolean
  project: string | null
  alias: string | null
  family: string | null
  variantLabel: string | null
  supersededBy: string | null
  /** Plain password for a semi-private deck, hashed server-side; null clears it. */
  accessPassword?: string | null
}

/** Body for copying a deck as a variant of its family or as the edition replacing it. */
export interface DuplicateDeckInput {
  slug: string
  mode: 'variant' | 'edition'
  title?: string
  variantLabel?: string
  /** The label the source takes when it had none. */
  sourceVariantLabel?: string
}

/** Deck writes. `trash` is a soft-delete (reversible from the corbeille). */
export const deckApi = {
  duplicate: (fetch: Fetcher, slug: string, body: DuplicateDeckInput) =>
    fetch(`/api/presentations/${slug}/duplicate`, { method: 'POST', body }),
  create: (fetch: Fetcher, body: CreateDeckInput) =>
    fetch('/api/presentations', { method: 'POST', body }),
  updateMeta: (fetch: Fetcher, slug: string, body: UpdateDeckMetaInput) =>
    fetch(`/api/admin/decks/${slug}`, { method: 'PATCH', body }),
  trash: (fetch: Fetcher, slug: string) =>
    fetch(`/api/presentations/${slug}`, { method: 'DELETE' }),
}
