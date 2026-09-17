import type { DeckVersionDetail, DraftSnapshotDetail, HistoryEntry } from '#shared/presentations'
import type { Fetcher } from './http'

/** A history entry by kind and id. */
export type HistoryRef = Pick<HistoryEntry, 'kind' | 'id'>

function path(slug: string, ref: HistoryRef): string {
  return `/api/presentations/${slug}/${ref.kind === 'version' ? 'versions' : 'snapshots'}/${ref.id}`
}

/** The history of a deck: its entries, their text, restoring one, keeping a snapshot. */
export const historyApi = {
  list: (fetch: Fetcher, slug: string) =>
    fetch<{ entries: HistoryEntry[] }>(`/api/presentations/${slug}/history`).then(r => r.entries),
  load: (fetch: Fetcher, slug: string, ref: HistoryRef) =>
    fetch<DeckVersionDetail | DraftSnapshotDetail>(path(slug, ref)),
  restore: (fetch: Fetcher, slug: string, ref: HistoryRef) =>
    fetch<{ ok: true, stamp: number | null }>(`${path(slug, ref)}/restore`, { method: 'POST' }),
  snapshot: (fetch: Fetcher, slug: string, label?: string) =>
    fetch<{ ok: true, id: number | null }>(`/api/presentations/${slug}/snapshots`, { method: 'POST', body: label ? { label } : {} }),
}
