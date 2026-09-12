import type { Fetcher } from '../api'
import { catalogApi } from '../api'
import { catalogKeys } from './keys'

/**
 * A grant given elsewhere must show up without a reload: the lists are stale at
 * once, so any navigation or window focus refetches them. `useCatalog` adds the
 * periodic re-read while a page stays open.
 */
const CATALOG_FRESHNESS = { staleTime: 0 } as const

/**
 * Declarative query options for the catalog. Colocated with the keys so a query
 * is declared once (key + fetch) and consumed as-is by `useQuery`; the composable
 * only supplies the fetcher (`useRequestFetch()` on SSR, `$fetch` otherwise).
 */
export function presentationsQuery(fetch: Fetcher) {
  return {
    key: catalogKeys.presentations,
    query: () => catalogApi.listPresentations(fetch),
    ...CATALOG_FRESHNESS,
  }
}

export function projectsQuery(fetch: Fetcher) {
  return {
    key: catalogKeys.projects,
    query: () => catalogApi.listProjects(fetch),
    ...CATALOG_FRESHNESS,
  }
}
