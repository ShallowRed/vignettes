import { getActor } from '../utils/actor'

/**
 * `/api/_auth/session`, the route of nuxt-auth-utils, answers 401 for a session
 * that `getActor` refuses (account removed, logout, change of role), through the
 * `fetch` hook the module provides
 * (https://github.com/atinux/nuxt-auth-utils#extend-session).
 */
export default defineNitroPlugin(() => {
  sessionHooks.hook('fetch', async (session, event) => {
    if (session.user && (await getActor(event)).role === 'anonymous')
      throw createError({ statusCode: 401, statusMessage: 'Session ended' })
  })
  sessionHooks.hook('clear', (_session, event) => void delete event.context.actor)
})
