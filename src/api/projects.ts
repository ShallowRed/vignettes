import type { Project } from '#shared/projects'
import type { Fetcher } from './http'

/** Body for creating a project (folder). Slug derived server-side when absent. */
export interface CreateProjectInput {
  title: string
  color?: string | null
  icon?: string | null
  slug?: string
}

/** Body for a project edit. A slug change cascades to the folder's decks. */
export interface UpdateProjectInput {
  title?: string
  color?: string | null
  icon?: string | null
  slug?: string
}

/** Project writes. `trash` soft-deletes the folder and its decks together. */
export const projectApi = {
  create: (fetch: Fetcher, body: CreateProjectInput) =>
    fetch<Project>('/api/admin/projects', { method: 'POST', body }),
  update: (fetch: Fetcher, slug: string, body: UpdateProjectInput) =>
    fetch<Project>(`/api/admin/projects/${slug}`, { method: 'PATCH', body }),
  trash: (fetch: Fetcher, slug: string) =>
    fetch(`/api/admin/projects/${slug}`, { method: 'DELETE' }),
}
