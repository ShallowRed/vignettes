import { RECETTE_PERSONAS } from '#shared/recette/personas'
import { assertRecette } from '../../utils/recette'
import { useUserStore } from '../../utils/users'

/**
 * GET /auth/recette?as=<persona>|anonymous|me&redirect=<path>: open the app as one
 * of the kit's personas, without a session (`anonymous`), or as the owner who
 * opened the kit (`me`). Requires the pass
 * (see `assertRecette`). The persona account is upserted with its role, so the
 * database-first role resolution agrees with the session.
 */
export default defineEventHandler(async (event) => {
  const pass = await assertRecette(event)
  const query = getQuery(event)

  if (query.as === 'me') {
    await setUserSession(event, { user: { id: pass.user.id, login: pass.user.login, name: pass.user.name, role: 'owner' } })
  }
  else if (query.as === 'anonymous') {
    await clearUserSession(event)
  }
  else {
    const persona = RECETTE_PERSONAS.find(p => p.key === query.as)
    if (!persona)
      throw createError({ statusCode: 400, statusMessage: 'Persona inconnue' })
    await useUserStore().upsertOnLogin({ id: persona.id, login: persona.login, name: persona.name, avatarUrl: null }, persona.role)
    await setUserSession(event, { user: { id: persona.id, login: persona.login, name: persona.name, role: persona.role } })
  }

  const redirect = typeof query.redirect === 'string' && query.redirect.startsWith('/') && !query.redirect.startsWith('//')
    ? query.redirect
    : '/'
  return sendRedirect(event, redirect)
})
