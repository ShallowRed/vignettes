/**
 * GitHub OAuth handler. Upserts the user; the database owns the role from then
 * on — the env map (`NUXT_OWNER_LOGINS` / `NUXT_EDITOR_LOGINS`) only seeds the
 * first login. The role in the session is a display snapshot, not an authority
 * (see `resolveActorRole`).
 */

import { readRoleMap, resolveRole } from '#shared/access'
import { useUserStore } from '../../utils/users'

export default defineOAuthGitHubEventHandler({
  config: {},
  async onSuccess(event, { user }) {
    const role = await useUserStore().upsertOnLogin(
      { id: user.id, login: user.login, name: user.name, avatarUrl: user.avatar_url },
      resolveRole(user.login, readRoleMap()),
    ).catch(() => resolveRole(user.login, readRoleMap()))

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
    return sendRedirect(event, isSafe ? intended : '/')
  },
  onError(event, error) {
    console.error('GitHub OAuth error:', error)
    return sendRedirect(event, '/login?error=oauth_failed')
  },
})
