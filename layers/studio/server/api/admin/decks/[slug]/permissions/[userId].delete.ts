import { isDeckSlug } from '@vignettes/core/deck'
import { assertCanShareDeck } from '../../../../../utils/access'
import { securityLog } from '../../../../../utils/security-log'
import { usePermissionStore } from '../../../../../utils/sources'

/** DELETE /api/admin/decks/:slug/permissions/:userId: revoke a grant (whoever may share the deck). */
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  const userId = Number(getRouterParam(event, 'userId'))
  if (!slug || !isDeckSlug(slug) || !Number.isInteger(userId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid slug or user id' })
  }
  const actor = await assertCanShareDeck(event, slug)

  await usePermissionStore().remove(slug, userId)
  securityLog(event, 'grant-change', { deck: slug, account: userId, role: 'none' }, actor.login)
  return { ok: true }
})
