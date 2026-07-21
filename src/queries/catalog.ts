import type { Fetcher } from '~/api'
import { catalogApi } from '~/api'
import { catalogKeys } from './keys'

/**
 * Declarative query options for the catalog. Colocated with the keys so a query
 * is declared once (key + fetch) and consumed as-is by `useQuery`; the composable
 * only supplies the fetcher (`useRequestFetch()` on SSR, `$fetch` otherwise).
 */
export function presentationsQuery(fetch: Fetcher) {
  return {
    key: catalogKeys.presentations,
    query: () => catalogApi.listPresentations(fetch),
  }
}

export function projectsQuery(fetch: Fetcher) {
  return {
    key: catalogKeys.projects,
    query: () => catalogApi.listProjects(fetch),
  }
}
