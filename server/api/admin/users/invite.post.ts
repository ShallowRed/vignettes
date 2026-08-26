import { z } from 'zod'
import { assertOwner } from '../../../utils/access'
import { useUserStore } from '../../../utils/users'

const BodySchema = z.object({ email: z.string().email().max(254) }).strict()

/**
 * POST /api/admin/users/invite — pre-provision a Google account by email so it
 * can be granted deck/project access before its first login (the sharing UI's
 * "invite on the fly"). Owner only, like the grant endpoints it feeds.
 * Idempotent: an existing account with this login is returned untouched.
 */
export default defineEventHandler(async (event) => {
  await assertOwner(event)

  const parsed = BodySchema.safeParse(await readBody(event))
  if (!parsed.success)
    throw createError({ statusCode: 400, statusMessage: 'A valid email is required' })

  return await useUserStore().invite(parsed.data.email)
})
