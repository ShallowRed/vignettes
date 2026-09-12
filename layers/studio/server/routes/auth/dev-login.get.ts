/**
 * Dev-only login. GitHub OAuth needs `NUXT_OAUTH_GITHUB_*` secrets and a network
 * round-trip, which makes local iteration on gated features (editor, admin)
 * painful. This route mints a privileged session for a synthetic per-role account
 * so you can test as owner/editor/viewer offline.
 *
 * Gated on `import.meta.dev`: in a production build the constant is `false`, the
 * guard becomes dead code and the route always 404s. It is never a prod path.
 *
 * Role resolution is database-first (`resolveActorRole` ignores the sealed role),
 * so we upsert the account with its role — mirroring the real GitHub handler.
 * `onConflictDoUpdate` keeps the role stable, hence one account per role.
 */
import { RoleSchema } from '#shared/access'
import { useUserStore } from '../../utils/users'

// Deterministic, high ids that cannot collide with real GitHub user ids in dev.
const DEV_ACCOUNTS = {
  owner: { id: 900_000_001, login: 'dev-owner', name: 'Dev Owner' },
  editor: { id: 900_000_002, login: 'dev-editor', name: 'Dev Editor' },
  viewer: { id: 900_000_003, login: 'dev-viewer', name: 'Dev Viewer' },
} as const

export default defineEventHandler(async (event) => {
  if (!import.meta.dev)
    throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const query = getQuery(event)
  const parsed = RoleSchema.safeParse(query.role)
  const role = parsed.success && parsed.data !== 'anonymous' ? parsed.data : 'owner'
  const account = DEV_ACCOUNTS[role]

  // Bootstrap the row with its role (DB stays the authority on subsequent logins).
  await useUserStore()
    .upsertOnLogin({ id: account.id, login: account.login, name: account.name, avatarUrl: null }, role)
    .catch(() => {})

  await setUserSession(event, {
    user: { id: account.id, login: account.login, name: account.name, role },
  })

  const redirect = typeof query.redirect === 'string' && query.redirect.startsWith('/') && !query.redirect.startsWith('//')
    ? query.redirect
    : '/'
  return sendRedirect(event, redirect)
})
