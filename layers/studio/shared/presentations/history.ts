/**
 * Wire contract of a deck's history: the versions published and the snapshots
 * of the draft, newest first. Read by `GET /api/presentations/:slug/history`
 * and the history panel of the editor.
 */
export interface DeckVersionSummary {
  id: number
  /** Publication time, in milliseconds. */
  publishedAt: number
  /** Login of the account that published. */
  publishedBy: string
  /** Size of the markdown, in bytes. */
  bytes: number
  /** True for the version the visitors see. */
  current: boolean
}

/** One version with its markdown, from `GET /api/presentations/:slug/versions/:id`. */
export interface DeckVersionDetail extends DeckVersionSummary {
  raw: string
}

/** A snapshot of the draft: automatic while people edit, or taken on demand with a label. */
export interface DraftSnapshotEntry {
  kind: 'snapshot'
  id: number
  /** When it was taken, in milliseconds. */
  at: number
  /** Logins of the accounts that edited since the previous snapshot. */
  authors: string[]
  label: string | null
  /** Size of the markdown, in bytes. */
  bytes: number
}

export interface PublishedEntry {
  kind: 'version'
  id: number
  /** Publication time, in milliseconds. */
  at: number
  publishedBy: string
  bytes: number
  /** True for the version the visitors see. */
  current: boolean
}

/** One moment of the history, as `GET /api/presentations/:slug/history` lists them. */
export type HistoryEntry = PublishedEntry | DraftSnapshotEntry

/** One snapshot with its markdown, from `GET /api/presentations/:slug/snapshots/:id`. */
export interface DraftSnapshotDetail extends DraftSnapshotEntry {
  raw: string
}
