/**
 * GitHub OAuth handler. Resolves the actor's role from the env login→role map
 * (`NUXT_OWNER_LOGINS` / `NUXT_EDITOR_LOGINS`); unknown logins become `viewer`.
 */

import { readRoleMap, resolveRole } from '#shared/access'

export default defineOAuthGitHubEventHandler({
  config: {},
  async onSuccess(event, { user }) {
    const role = resolveRole(user.login, readRoleMap())

    await setUserSession(event, {
      user: {
        id: user.id,
        login: user.login,
        name: user.name,
        avatar: user.avatar_url,
        role,
      },
    })

    // Honour a stashed destination, but only same-origin paths (avoid open-redirect).
    const intended = getCookie(event, 'auth_redirect')
    deleteCookie(event, 'auth_redirect')
    const isSafe = intended && intended.startsWith('/') && !intended.startsWith('//')
    const fallback = role === 'viewer' ? '/' : '/admin'
    return sendRedirect(event, isSafe ? intended : fallback)
  },
  onError(event, error) {
    console.error('GitHub OAuth error:', error)
    return sendRedirect(event, '/login?error=oauth_failed')
  },
})
