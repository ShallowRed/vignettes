import { assertOwner } from '../../../utils/access'
import { useUserStore } from '../../../utils/users'

/**
 * DELETE /api/admin/users/:id — remove an account and every grant it holds
 * (owner only). Permanent, but not destructive of content: decks and versions
 * never belong to a user. Guards: not yourself (no lock-out), and never an
 * owner (demote first, so removing the wrong account stays a two-step act).
 * A live session of the removed account is anonymous from its next request:
 * `getActor` refuses a session whose id names no row, and the store never gives
 * that id to another account.
 */
export default defineEventHandler(async (event) => {
  const actor = await assertOwner(event)

  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id))
    throw createError({ statusCode: 400, statusMessage: 'Invalid user id' })
  if (id === actor.id)
    throw createError({ statusCode: 400, statusMessage: 'You cannot remove your own account' })

  const store = useUserStore()
  const account = await store.getAccount(id)
  if (!account)
    throw createError({ statusCode: 404, statusMessage: 'Unknown user' })
  if (account.role === 'owner')
    throw createError({ statusCode: 400, statusMessage: 'Demote an owner before removing the account' })

  await store.remove(id)
  return { removed: true }
})
