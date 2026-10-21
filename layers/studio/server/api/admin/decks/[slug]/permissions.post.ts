import { HandleGrantBodySchema, mayGrantUntil, mayWriteGrantOf } from '#shared/access'
import { isDeckSlug } from '@vignettes/core/deck'
import { assertCanShareDeck, sharingLimitOn } from '../../../../utils/access'
import { hitRateLimit } from '../../../../utils/rate-limit'
import { securityLog } from '../../../../utils/security-log'
import { usePermissionStore } from '../../../../utils/sources'
import { useUserStore } from '../../../../utils/users'

// Each request may create an invited account: cap them per sharer.
const SHARES = 30
const SHARE_WINDOW_MS = 10 * 60 * 1000

/**
 * POST /api/admin/decks/:slug/permissions: grant editor/viewer on a deck to an
 * account named by its provider handle (whoever may share the deck). A handle
 * that never logged in becomes an invited viewer account, and the grant applies
 * at its first login. The sharer types the handle they know: the list of
 * accounts stays with the owner. A sharer other than the owner never writes
 * their own grant, and gives no access past their own (`mayGrantUntil`).
 */
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug || !isDeckSlug(slug)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid slug' })
  }
  const actor = await assertCanShareDeck(event, slug)

  const parsed = HandleGrantBodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Body must be { account: { provider, handle }, role: editor | viewer }' })
  }
  if (!hitRateLimit(`share:${actor.id}`, SHARES, SHARE_WINDOW_MS)) {
    throw createError({ statusCode: 429, statusMessage: 'Too many shares, try again later' })
  }

  const { account, role, expiresAt } = parsed.data
  const until = expiresAt ? new Date(expiresAt) : null
  // Checked before the invitation, which may create an account.
  const limit = await sharingLimitOn(actor, slug)
  if (!mayGrantUntil(limit, { role, expiresAt: until })) {
    throw createError({ statusCode: 403, statusMessage: 'A grant you give ends by the end of your own access', data: { until: limit?.toISOString() } })
  }

  const user = await useUserStore().invite(account)
  if (!mayWriteGrantOf(actor, user.id)) {
    throw createError({ statusCode: 403, statusMessage: 'You cannot change your own grant' })
  }
  await usePermissionStore().set(slug, user.id, role, actor.login ?? 'unknown', until)
  securityLog(event, 'grant-change', { deck: slug, account: user.id, role, until: until?.toISOString() }, actor.login)
  return { ok: true, slug, userId: user.id, login: user.login, role }
})
