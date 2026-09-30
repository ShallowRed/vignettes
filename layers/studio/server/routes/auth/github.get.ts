/**
 * GitHub OAuth handler. Upserts the user; the database owns the role from then
 * on, the env map (`NUXT_OWNER_LOGINS` / `NUXT_EDITOR_LOGINS`) only seeds the
 * first login. The role in the session is a display snapshot, not an authority
 * (see `resolveActorRole`). Without a row there is no safe internal id to seal,
 * so a store failure falls through to onError (fail closed).
 */

import process from 'node:process'
import { readRoleMap, resolveRole } from '#shared/access'
import { useUserStore } from '../../utils/users'

export default defineOAuthGitHubEventHandler({
  config: {},
  async onSuccess(event, { user }) {
    // Identity is (provider, providerId); the returned internal id, equal to
    // the GitHub id for rows that predate 0010, is what the session carries.
    const roles = readRoleMap(process.env)
    const { id, role } = await useUserStore().upsertOAuthLogin(
      { provider: 'github', providerId: String(user.id), login: user.login, name: user.name, avatarUrl: user.avatar_url },
      resolveRole(user.login, roles),
      // The login is issued by GitHub itself, so it may claim an invitation.
      { claimInvited: true, firstAccountOwns: roles.owner.length === 0 },
    )

    await setUserSession(event, {
      user: {
        id,
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
