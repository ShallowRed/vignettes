import type { PublicationStatus } from '../access/status'

/**
 * Trash (corbeille) wire contracts, shared by `GET /api/admin/trash` and the
 * client. Decks trashed *with* a project are represented by their project entry
 * (restored/purged together), so `decks` here lists only standalone trashed decks.
 */

/** A trashed project (folder) plus how many decks were trashed with it. */
export interface TrashedProjectSummary {
  slug: string
  title: string
  color?: string | null
  deckCount: number
}

/** A standalone trashed deck (not part of a trashed folder). */
export interface TrashedDeckSummary {
  slug: string
  title: string
  project?: string
  status: PublicationStatus
}

/** The full corbeille listing. */
export interface TrashListing {
  projects: TrashedProjectSummary[]
  decks: TrashedDeckSummary[]
}

/** What a restore/purge acts on. */
export interface TrashTarget {
  kind: 'project' | 'deck'
  slug: string
}
