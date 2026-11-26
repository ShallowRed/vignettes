/**
 * Wire contract of a deck's history: the versions published and the snapshots
 * of the draft, newest first. Read by `GET /api/presentations/:slug/history`
 * and the history panel of the editor.
 */
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
  /** Login of the account that published. */
  publishedBy: string
  /** Size of the markdown, in bytes. */
  bytes: number
  /** True for the version the visitors see. */
  current: boolean
}

/** One published version with its markdown, from `GET /api/presentations/:slug/versions/:id`. */
export interface PublishedEntryDetail extends PublishedEntry {
  raw: string
}

/** One moment of the history, as `GET /api/presentations/:slug/history` lists them. */
export type HistoryEntry = PublishedEntry | DraftSnapshotEntry

/** The kinds of `HistoryEntry`, which the events of the studio name. */
export const HISTORY_ENTRY_KINDS = ['version', 'snapshot'] as const satisfies readonly HistoryEntry['kind'][]

/**
 * Newest first. Times are kept to the second: at the same second a snapshot
 * comes before a version, since the draft moves after a publish, and two
 * entries of one kind follow their ids.
 */
export function compareHistoryEntries(a: HistoryEntry, b: HistoryEntry): number {
  if (a.at !== b.at)
    return b.at - a.at
  if (a.kind !== b.kind)
    return a.kind === 'snapshot' ? -1 : 1
  return b.id - a.id
}

/** One snapshot with its markdown, from `GET /api/presentations/:slug/snapshots/:id`. */
export interface DraftSnapshotDetail extends DraftSnapshotEntry {
  raw: string
}
