import { assertOwner } from '../../../utils/access'
import { useUserStore } from '../../../utils/users'

/**
 * DELETE /api/admin/users/:id — remove an account and every grant it holds
 * (owner only). Permanent, but not destructive of content: decks and versions
 * never belong to a user. Guards: not yourself (no lock-out), and never an
 * owner (demote first, so removing the wrong account stays a two-step act).
 * A live session for the removed account degrades on its next request: role
 * resolution is database-first, so the stale cookie no longer resolves.
 */
export default defineEventHandler(async (event) => {
  const actor = await assertOwner(event)

  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id))
    throw createError({ statusCode: 400, statusMessage: 'Invalid user id' })
  if (id === actor.id)
    throw createError({ statusCode: 400, statusMessage: 'You cannot remove your own account' })

  const store = useUserStore()
  const role = await store.getRole(id)
  if (role === null)
    throw createError({ statusCode: 404, statusMessage: 'Unknown user' })
  if (role === 'owner')
    throw createError({ statusCode: 400, statusMessage: 'Demote an owner before removing the account' })

  await store.remove(id)
  return { removed: true }
})
