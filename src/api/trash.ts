import type { TrashListing, TrashTarget } from '#shared/trash'
import type { Fetcher } from './http'

function segment(kind: TrashTarget['kind']): string {
  return kind === 'project' ? 'projects' : 'decks'
}

/** The trash (corbeille): list, restore, or permanently purge. */
export const trashApi = {
  list: (fetch: Fetcher) => fetch<TrashListing>('/api/admin/trash'),
  restore: (fetch: Fetcher, target: TrashTarget) =>
    fetch(`/api/admin/trash/${segment(target.kind)}/${target.slug}/restore`, { method: 'POST' }),
  purge: (fetch: Fetcher, target: TrashTarget) =>
    fetch(`/api/admin/trash/${segment(target.kind)}/${target.slug}`, { method: 'DELETE' }),
}
