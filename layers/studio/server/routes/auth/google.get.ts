/**
 * Google OAuth handler, mirror of the GitHub one. Google has no handle, so the
 * email doubles as `login` — it is both what the catalog displays and what the
 * bootstrap role map (`NUXT_OWNER_LOGINS` / `NUXT_EDITOR_LOGINS`) keys on. The
 * `sub` claim stays a string end to end: at ~21 digits it does not fit a JS
 * number. No database fallback here — without a row there is no safe internal
 * id to seal, so a store failure falls through to onError (fail closed).
 */

import { resolveRole, safeRedirectPath } from '#shared/access'
import { serverConfig } from '../../utils/config'
import { useUserStore } from '../../utils/users'

export default defineOAuthGoogleEventHandler({
  config: {},
  async onSuccess(event, { user }) {
    const login = (user.email as string).toLowerCase()
    const roles = serverConfig().roleMap
    const verified = user.email_verified === true
    const { id, role } = await useUserStore().upsertOAuthLogin(
      { provider: 'google', providerId: String(user.sub), login, name: user.name, avatarUrl: user.picture },
      resolveRole(login, roles),
      // A verified email may claim a pre-provisioned invited account; an
      // unverified one must never inherit an invitation's grants.
      { claimInvited: verified, firstAccountOwns: verified && roles.owner.length === 0 },
    )

    await setUserSession(event, {
      user: {
        id,
        login,
        name: user.name,
        avatar: user.picture,
        role,
      },
    })

    const intended = getCookie(event, 'auth_redirect')
    deleteCookie(event, 'auth_redirect')
    return sendRedirect(event, safeRedirectPath(intended))
  },
  onError(event, error) {
    console.error('Google OAuth error:', error)
    return sendRedirect(event, '/login?error=oauth_failed')
  },
})
