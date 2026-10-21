import { assertSignedIn } from '../../utils/access'
import { useTokenStore } from '../../utils/personal-token'
import { securityLog } from '../../utils/security-log'

/** DELETE /api/tokens/current: revokes the personal token of the request, for `vignettes logout`. */
export default defineEventHandler(async (event): Promise<{ action: 'revoked' }> => {
  const actor = await assertSignedIn(event)
  if (!actor.token)
    throw createError({ statusCode: 400, statusMessage: 'This route expects a personal token' })
  await useTokenStore().revoke(actor.token.id, actor.id, new Date())
  securityLog(event, 'token-revocation', { token: actor.token.prefix }, actor.login)
  return { action: 'revoked' }
})
