/**
 * Google OAuth handler, mirror of the GitHub one. Google has no handle, so the
 * email doubles as `login` — it is both what the catalog displays and what the
 * bootstrap role map (`NUXT_OWNER_LOGINS` / `NUXT_EDITOR_LOGINS`) keys on. The
 * `sub` claim stays a string end to end: at ~21 digits it does not fit a JS
 * number. No database fallback here — without a row there is no safe internal
 * id to seal, so a store failure falls through to onError (fail closed).
 */

import { resolveRole, safeRedirectPath } from '#shared/access'
import { openUserSession } from '../../utils/actor'
import { serverConfig } from '../../utils/config'
import { securityLog } from '../../utils/security-log'
import { useUserStore } from '../../utils/users'

export default defineOAuthGoogleEventHandler({
  config: {},
  async onSuccess(event, { user }) {
    const login = (user.email as string).toLowerCase()
    const roles = serverConfig().roleMap
    const verified = user.email_verified === true
    const { id, role } = await useUserStore().upsertOAuthLogin(
      { provider: 'google', providerId: String(user.sub), login, name: user.name, avatarUrl: user.picture },
      // A role of `NUXT_OWNER_LOGINS` or `NUXT_EDITOR_LOGINS`, or a
      // pre-provisioned invited account, goes to a verified email only.
      verified ? resolveRole(login, roles) : 'viewer',
      { claimInvited: verified, firstAccountOwns: verified && roles.owner.length === 0 },
    )

    await openUserSession(event, { id, login, name: user.name, avatar: user.picture, role })
    securityLog(event, 'login', { provider: 'google', account: id, email: verified ? 'verified' : 'unverified' }, login)

    const intended = getCookie(event, 'auth_redirect')
    deleteCookie(event, 'auth_redirect')
    return sendRedirect(event, safeRedirectPath(intended))
  },
  onError(event, error) {
    console.error('Google OAuth error:', error)
    securityLog(event, 'login-failure', { provider: 'google' })
    return sendRedirect(event, '/login?error=oauth_failed')
  },
})
