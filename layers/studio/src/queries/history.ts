import type { MaybeRefOrGetter } from 'vue'
import type { Fetcher } from '../api'
import { historyApi } from '../api'
import { deckKeys } from './keys'

/**
 * The history panel opens after publications made in this tab or elsewhere, so
 * the listing is stale at once; a version itself never changes.
 */
export function historyQuery(fetch: Fetcher, slug: string) {
  return {
    key: deckKeys.history(slug),
    query: () => historyApi.list(fetch, slug),
    staleTime: 0,
  }
}

/** One version; the caller enables the query once an id is chosen. */
export function versionQuery(fetch: Fetcher, slug: string, id: MaybeRefOrGetter<number | null>) {
  return {
    key: () => deckKeys.version(slug, toValue(id) ?? 0),
    query: () => historyApi.load(fetch, slug, toValue(id)!),
    staleTime: Infinity,
  }
}
