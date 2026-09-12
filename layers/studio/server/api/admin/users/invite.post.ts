import { z } from 'zod'
import { assertOwner } from '../../../utils/access'
import { useUserStore } from '../../../utils/users'

// A handle is provider-shaped: a Google email, or a GitHub username (which can
// never contain `@`, so the two namespaces stay distinct).
const BodySchema = z.discriminatedUnion('provider', [
  z.object({ provider: z.literal('google'), handle: z.string().email().max(254) }).strict(),
  z.object({ provider: z.literal('github'), handle: z.string().regex(/^[a-z0-9][a-z0-9-]{0,38}$/i) }).strict(),
])

/**
 * POST /api/admin/users/invite — pre-provision an account by provider handle so
 * it can be granted deck/project access before its first login (the sharing
 * UI's "authorize on the fly"). Owner only, like the grant endpoints it feeds.
 * Idempotent: an existing account for this handle is returned untouched.
 */
export default defineEventHandler(async (event) => {
  await assertOwner(event)

  const parsed = BodySchema.safeParse(await readBody(event))
  if (!parsed.success)
    throw createError({ statusCode: 400, statusMessage: 'A provider and a valid handle are required' })

  return await useUserStore().invite(parsed.data)
})
