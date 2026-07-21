import type { PresentationListItem } from '#shared/presentations'
import type { Project } from '#shared/projects'
import type { Fetcher } from './http'

/**
 * Catalog reads: the access-filtered deck listing and the project folders. Both
 * endpoints are session-dependent, so pass `useRequestFetch()` on SSR.
 */
export const catalogApi = {
  listPresentations: (fetch: Fetcher) => fetch<PresentationListItem[]>('/api/presentations'),
  listProjects: (fetch: Fetcher) => fetch<Project[]>('/api/projects'),
}
