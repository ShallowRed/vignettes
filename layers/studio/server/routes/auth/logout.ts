import { getActor } from '../../utils/actor'
import { clearRecettePass } from '../../utils/recette'
import { securityLog } from '../../utils/security-log'
import { useUserStore } from '../../utils/users'

/**
 * POST /auth/logout: ends every session of the account, on every device, then
 * clears the cookie. A sealed cookie stays readable after the browser drops it,
 * and the session version is what refuses a copy. Another method answers 405,
 * so that a link or an image on another site cannot sign the visitor out.
 */
export default defineEventHandler(async (event) => {
  assertMethod(event, 'POST')
  const actor = await getActor(event)
  if (actor.id) {
    await useUserStore().endSessions(actor.id)
    securityLog(event, 'logout', { account: actor.id }, actor.login)
  }
  await clearUserSession(event)
  clearRecettePass(event)
  return sendRedirect(event, '/', 303)
})
