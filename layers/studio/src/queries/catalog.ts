import type { Fetcher } from '../api'
import { catalogApi } from '../api'
import { catalogKeys } from './keys'
import { throughPayload } from './payload'

/**
 * A grant given elsewhere must show up without a reload: the lists go stale two
 * seconds after a read, so any navigation or window focus refetches them, while
 * a component mounted right after a read (the settings drawer opened from the
 * editor) reuses it. `useCatalog` adds the periodic re-read while a page stays open.
 */
// With `ssrCatchError`, a read that fails during SSR renders the error state of the section.
const CATALOG_FRESHNESS = { staleTime: 2_000, ssrCatchError: true } as const

/**
 * Declarative query options for the catalog. Colocated with the keys so a query
 * is declared once (key + fetch) and consumed as-is by `useQuery`; the composable
 * only supplies the fetcher (`useRequestFetch()` on SSR, `$fetch` otherwise).
 */
export function presentationsQuery(fetch: Fetcher) {
  return {
    key: catalogKeys.presentations,
    query: () => throughPayload(catalogApi.listPresentations(fetch)),
    ...CATALOG_FRESHNESS,
  }
}

export function projectsQuery(fetch: Fetcher) {
  return {
    key: catalogKeys.projects,
    query: () => throughPayload(catalogApi.listProjects(fetch)),
    ...CATALOG_FRESHNESS,
  }
}

/** The templates change with a deployment only: read once per page load. */
export function templatesQuery(fetch: Fetcher) {
  return {
    key: catalogKeys.templates,
    query: () => catalogApi.listTemplates(fetch),
    staleTime: Infinity,
  }
}
