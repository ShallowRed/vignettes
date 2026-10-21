import { GrantBodySchema, mayGrantUntil, mayWriteGrantOf } from '#shared/access'
import { isDeckSlug } from '@vignettes/core/deck'
import { assertCanShareDeck, sharingLimitOn } from '../../../../../utils/access'
import { usePermissionStore } from '../../../../../utils/sources'
import { useUserStore } from '../../../../../utils/users'

/**
 * PUT /api/admin/decks/:slug/permissions/:userId: grant editor/viewer on a deck.
 * The owner grants any account by its id. Another sharer changes the grants the
 * deck already lists: an id is how the owner's account picker names an account,
 * and accepting any id would let a sharer read every login through the grant list.
 * A sharer adds an account by its handle, through `POST .../permissions`, never
 * writes their own grant, and extends no grant past their own access
 * (`mayGrantUntil`).
 */
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  const userId = Number(getRouterParam(event, 'userId'))
  if (!slug || !isDeckSlug(slug) || !Number.isInteger(userId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid slug or user id' })
  }
  const actor = await assertCanShareDeck(event, slug)

  const parsed = GrantBodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Body must be { role: editor | viewer }' })
  }

  const listed = (await usePermissionStore().listForDeck(slug)).find(grant => grant.userId === userId)
  const known = actor.role === 'owner' ? await useUserStore().getAccount(userId) != null : listed !== undefined
  if (!known) {
    throw createError({ statusCode: 404, statusMessage: 'Unknown user' })
  }
  if (!mayWriteGrantOf(actor, userId)) {
    throw createError({ statusCode: 403, statusMessage: 'You cannot change your own grant' })
  }
  const until = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null
  const limit = await sharingLimitOn(actor, slug)
  if (!mayGrantUntil(limit, { role: parsed.data.role, expiresAt: until }, listed)) {
    throw createError({ statusCode: 403, statusMessage: 'A grant you give ends by the end of your own access', data: { until: limit?.toISOString() } })
  }

  await usePermissionStore().set(slug, userId, parsed.data.role, actor.login ?? 'unknown', until)
  return { ok: true, slug, userId, role: parsed.data.role }
})
