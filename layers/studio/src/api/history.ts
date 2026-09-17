import type { DeckVersionDetail, DeckVersionSummary } from '#shared/presentations'
import type { Fetcher } from './http'

/** The published versions of a deck, and the restoration of one into the draft. */
export const historyApi = {
  list: (fetch: Fetcher, slug: string) =>
    fetch<{ versions: DeckVersionSummary[] }>(`/api/presentations/${slug}/versions`).then(r => r.versions),
  load: (fetch: Fetcher, slug: string, id: number) =>
    fetch<DeckVersionDetail>(`/api/presentations/${slug}/versions/${id}`),
  restore: (fetch: Fetcher, slug: string, id: number) =>
    fetch<{ ok: true, stamp: number | null }>(`/api/presentations/${slug}/versions/${id}/restore`, { method: 'POST' }),
}
