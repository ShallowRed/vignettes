import type { PresentationListItem } from '#shared/presentations'
import type { Project } from '#shared/projects'
import type { Fetcher } from './http'

/**
 * Catalog reads: the access-filtered deck listing, the project folders, the
 * templates of a new deck and the Markdown of a deck. The listings and the
 * Markdown are session-dependent, so pass `useRequestFetch()` on SSR.
 */
export const catalogApi = {
  listPresentations: (fetch: Fetcher) => fetch<PresentationListItem[]>('/api/presentations'),
  listProjects: (fetch: Fetcher) => fetch<Project[]>('/api/projects'),
  listTemplates: (fetch: Fetcher) => fetch<string[]>('/api/templates'),
  deckMarkdown: (fetch: Fetcher, slug: string, version: 'published' | 'draft') =>
    fetch<string>(`/api/presentations/${slug}/markdown`, { query: version === 'draft' ? { draft: '' } : {}, responseType: 'text' }),
}
