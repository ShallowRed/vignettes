import { ProviderHandleSchema } from '#shared/access'
import { assertOwner } from '../../../utils/access'
import { useUserStore } from '../../../utils/users'

/**
 * POST /api/admin/users/invite — pre-provision an account by provider handle so
 * it can be granted deck/project access before its first login (the sharing
 * UI's "authorize on the fly"). Owner only: it feeds the owner's account picker;
 * another sharer of a deck invites through `POST /api/admin/decks/:slug/permissions`.
 * Idempotent: an existing account for this handle is returned untouched.
 */
export default defineEventHandler(async (event) => {
  await assertOwner(event)

  const parsed = ProviderHandleSchema.safeParse(await readBody(event))
  if (!parsed.success)
    throw createError({ statusCode: 400, statusMessage: 'A provider and a valid handle are required' })

  return await useUserStore().invite(parsed.data)
})
