import { isDeckSlug } from '@vignettes/core/deck'
import { assertOwner } from '../../../../utils/access'
import { usePermissionStore } from '../../../../utils/sources'

/** GET /api/admin/decks/:slug/permissions — grants on a deck (owner only). */
export default defineEventHandler(async (event) => {
  await assertOwner(event)

  const slug = getRouterParam(event, 'slug')
  if (!slug || !isDeckSlug(slug)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid slug' })
  }

  return await usePermissionStore().listForDeck(slug)
})
