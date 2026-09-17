import type { MaybeRefOrGetter } from 'vue'
import type { Fetcher, HistoryRef } from '../api'
import { historyApi } from '../api'
import { deckKeys } from './keys'

/**
 * The history panel opens after publications and snapshots made in this tab
 * or elsewhere, so the listing is stale at once; an entry itself never changes.
 */
export function historyQuery(fetch: Fetcher, slug: string) {
  return {
    key: deckKeys.history(slug),
    query: () => historyApi.list(fetch, slug),
    staleTime: 0,
  }
}

/** One entry's text; the caller enables the query once an entry is chosen. */
export function historyEntryQuery(fetch: Fetcher, slug: string, ref: MaybeRefOrGetter<HistoryRef | null>) {
  return {
    key: () => {
      const value = toValue(ref)
      return deckKeys.historyEntry(slug, value?.kind ?? 'none', value?.id ?? 0)
    },
    query: () => historyApi.load(fetch, slug, toValue(ref)!),
    staleTime: Infinity,
  }
}
