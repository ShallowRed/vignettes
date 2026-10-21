import { tokenState } from '#shared/access'
import { assertSignedIn } from '../../utils/access'
import { useTokenStore } from '../../utils/personal-token'
import { securityLog } from '../../utils/security-log'

/**
 * DELETE /api/tokens/:id: revokes an active token of the signed-in account, and
 * removes one that is already revoked or expired from its list.
 */
export default defineEventHandler(async (event): Promise<{ action: 'revoked' | 'removed' }> => {
  const actor = await assertSignedIn(event)
  const id = Number(getRouterParam(event, 'id'))
  const store = useTokenStore()
  const token = Number.isInteger(id) ? (await store.listForUser(actor.id)).find(own => own.id === id) : undefined
  if (!token)
    throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const now = new Date()
  if (tokenState(token, now) === 'active') {
    await store.revoke(token.id, actor.id, now)
    securityLog(event, 'token-revocation', { token: token.prefix }, actor.login)
    return { action: 'revoked' }
  }
  await store.remove(token.id, actor.id, now)
  return { action: 'removed' }
})
