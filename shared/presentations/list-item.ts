import type { Lifecycle, PublicationStatus } from '../access/status'

// Canonical wire contract between GET /api/presentations and the home/admin pages.
export interface PresentationListItem {
  slug: string
  title: string
  theme: string
  status: PublicationStatus
  filename: string
  /** Frontmatter `project:` slug — the catalog's grouping axis. */
  project?: string
  /** Hidden from the catalog for non-privileged actors. */
  unlisted?: boolean
  /** Pinned to the top of the public showcase. */
  featured?: boolean
  /** Link to `/p/<alias>` when present. */
  alias?: string
  /** frozen/archived serve a static bundle. */
  lifecycle?: Lifecycle
  /** Privileged only: a committed file exists behind this deck (deleting the database state reverts to it). */
  fileBacked?: boolean
  /** Privileged only, database decks: false until a first publish gives the deck servable content. */
  published?: boolean
}

/** Canonical in-app path of a deck: stable alias when it has one, slug route otherwise. */
export function deckPath(item: Pick<PresentationListItem, 'alias' | 'slug'>): string {
  return item.alias ? `/p/${item.alias}` : `/slides/${item.slug}`
}

/** frozen/archived decks serve a static bundle and are read-only. */
export function isFrozen(item: Pick<PresentationListItem, 'lifecycle'>): boolean {
  return item.lifecycle === 'frozen' || item.lifecycle === 'archived'
}
