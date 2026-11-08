import { safeRedirectPath, tokenRole } from '#shared/access'
import { RECETTE_PERSONAS } from '#shared/recette/personas'
import { getActor, openUserSession } from '../../utils/actor'
import { assertRecette } from '../../utils/recette'
import { useUserStore } from '../../utils/users'

/**
 * POST /auth/recette, body `as=<persona>|anonymous|me&redirect=<path>`: open the
 * app as one of the kit's personas, without a session (`anonymous`), or as the
 * owner who opened the kit (`me`). Requires the pass (see `assertRecette`).
 * The persona account is upserted with its role, so the database-first role
 * resolution agrees with the session. Another method answers 405.
 *
 * A request made with a personal token opens the sessions whose role the token
 * may act with (`tokenRole`): the revocation of a token leaves the sessions it
 * opened running until they expire.
 */
export default defineEventHandler(async (event) => {
  assertMethod(event, 'POST')
  const pass = await assertRecette(event)
  const query = await readBody<Record<string, unknown>>(event) ?? {}
  const persona = RECETTE_PERSONAS.find(p => p.key === query.as)
  const role = query.as === 'me' ? 'owner' : persona?.role
  if (role && tokenRole(role) !== role && (await getActor(event)).token)
    throw createError({ statusCode: 403, statusMessage: 'Un jeton d\'accès n\'ouvre pas de session de propriétaire' })

  if (query.as === 'me') {
    await openUserSession(event, { id: pass.user.id, login: pass.user.login, name: pass.user.name, role: 'owner' })
  }
  else if (query.as === 'anonymous') {
    await clearUserSession(event)
  }
  else {
    if (!persona)
      throw createError({ statusCode: 400, statusMessage: 'Persona inconnue' })
    await useUserStore().upsertOnLogin({ id: persona.id, login: persona.login, name: persona.name, avatarUrl: null }, persona.role)
    await openUserSession(event, { id: persona.id, login: persona.login, name: persona.name, role: persona.role })
  }

  return sendRedirect(event, safeRedirectPath(query.redirect), 303)
})
