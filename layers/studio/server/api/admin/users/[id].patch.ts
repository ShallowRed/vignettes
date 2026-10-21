import { RoleSchema } from '#shared/access'
import { z } from 'zod'
import { assertOwner } from '../../../utils/access'
import { useUserStore } from '../../../utils/users'

const PatchSchema = z.object({
  role: RoleSchema.exclude(['anonymous']),
}).strict()

/**
 * PATCH /api/admin/users/:id — change a user's global role (owner only). An
 * owner cannot edit their own role: demotion by accident would lock the
 * instance out of user management.
 */
export default defineEventHandler(async (event) => {
  const actor = await assertOwner(event)

  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid user id' })
  }
  if (id === actor.id) {
    throw createError({ statusCode: 400, statusMessage: 'You cannot change your own role' })
  }

  const parsed = PatchSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Body must be { role: owner | editor | viewer }' })
  }

  const store = useUserStore()
  if (await store.getAccount(id) == null) {
    throw createError({ statusCode: 404, statusMessage: 'Unknown user' })
  }
  await store.setRole(id, parsed.data.role)
  return { ok: true, id, role: parsed.data.role }
})
