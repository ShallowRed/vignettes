import type { PresentationListItem } from '#shared/presentations'
import { listVisiblePresentations } from '../utils/catalog'

/**
 * Catalog endpoint. Visibility is decided by the shared `canList` on the actor's
 * role plus any grant — see `listVisiblePresentations`, the access-filtered
 * source of truth shared with the projects endpoint.
 */
export default defineEventHandler(async (event): Promise<PresentationListItem[]> => {
  try {
    return await listVisiblePresentations(event)
  }
  catch (error) {
    console.error('Error loading presentations:', error)
    return []
  }
})
