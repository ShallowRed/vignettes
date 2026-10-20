import { isDeckSlug } from '@vignettes/core/deck'
import { assertCanShareDeck } from '../../../../utils/access'
import { usePermissionStore } from '../../../../utils/sources'

/** GET /api/admin/decks/:slug/permissions: grants on a deck (whoever may share it). */
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug || !isDeckSlug(slug)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid slug' })
  }
  await assertCanShareDeck(event, slug)

  return await usePermissionStore().listForDeck(slug)
})
