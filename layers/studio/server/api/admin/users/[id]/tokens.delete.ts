import { assertOwner } from '../../../../utils/access'
import { useTokenStore } from '../../../../utils/personal-token'
import { securityLog } from '../../../../utils/security-log'
import { useUserStore } from '../../../../utils/users'

/** DELETE /api/admin/users/:id/tokens: revokes every active personal token of an account (owner only). */
export default defineEventHandler(async (event): Promise<{ revoked: number }> => {
  const actor = await assertOwner(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id))
    throw createError({ statusCode: 400, statusMessage: 'Invalid user id' })
  if (!await useUserStore().getAccount(id))
    throw createError({ statusCode: 404, statusMessage: 'Unknown user' })
  const revoked = await useTokenStore().revokeAllForUser(id, new Date())
  securityLog(event, 'token-revocation', { account: id, tokens: revoked }, actor.login)
  return { revoked }
})
