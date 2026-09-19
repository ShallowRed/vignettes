import type { PresentationListItem } from '#shared/presentations'
import { listVisiblePresentations } from '../utils/catalog'

/**
 * Catalog endpoint. Visibility is decided by the shared `canList` on the actor's
 * role plus any grant — see `listVisiblePresentations`, the access-filtered
 * source of truth shared with the projects endpoint.
 * A failed read answers an error: an empty list means that nothing is shared
 * with the actor.
 */
export default defineEventHandler(async (event): Promise<PresentationListItem[]> => {
  return await listVisiblePresentations(event)
})
