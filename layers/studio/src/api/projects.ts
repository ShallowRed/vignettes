import type { CreateProjectInput, Project, ProjectPatch } from '#shared/projects'
import type { Fetcher } from './http'

/** Project writes. `trash` soft-deletes the folder and its decks together. */
export const projectApi = {
  create: (fetch: Fetcher, body: CreateProjectInput) =>
    fetch<Project>('/api/admin/projects', { method: 'POST', body }),
  update: (fetch: Fetcher, slug: string, body: ProjectPatch) =>
    fetch<Project>(`/api/admin/projects/${slug}`, { method: 'PATCH', body }),
  trash: (fetch: Fetcher, slug: string) =>
    fetch(`/api/admin/projects/${slug}`, { method: 'DELETE' }),
}
