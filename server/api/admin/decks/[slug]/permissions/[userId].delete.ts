import { isDeckSlug } from '#shared/deck'
import { assertOwner } from '../../../../../utils/access'
import { usePermissionStore } from '../../../../../utils/sources'

/** DELETE /api/admin/decks/:slug/permissions/:userId — revoke a grant (owner only). */
export default defineEventHandler(async (event) => {
  await assertOwner(event)

  const slug = getRouterParam(event, 'slug')
  const userId = Number(getRouterParam(event, 'userId'))
  if (!slug || !isDeckSlug(slug) || !Number.isInteger(userId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid slug or user id' })
  }

  await usePermissionStore().remove(slug, userId)
  return { ok: true }
})
