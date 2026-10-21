import { beforeEach, describe, expect, it, vi } from 'vitest'

// The handlers run inside nuxt-auth-utils: `defineOAuth*EventHandler` receives
// the callbacks and routes a rejected `onSuccess` to `onError`. The stub hands
// the callbacks back so the test drives `onSuccess` itself.
vi.stubGlobal('defineOAuthGitHubEventHandler', (handler: unknown) => handler)
vi.stubGlobal('defineOAuthGoogleEventHandler', (handler: unknown) => handler)
const sealed = vi.fn()
vi.stubGlobal('replaceUserSession', sealed)
let stashed: string | undefined
vi.stubGlobal('getCookie', () => stashed)
vi.stubGlobal('deleteCookie', () => {})
vi.stubGlobal('sendRedirect', (_event: unknown, to: string) => to)
vi.stubGlobal('getRequestIP', () => '127.0.0.1')
vi.stubGlobal('getRequestHeader', () => undefined)

const upsertOAuthLogin = vi.fn()
vi.mock('../../layers/studio/server/utils/users', () => ({ useUserStore: () => ({ upsertOAuthLogin, getAccount: async () => ({ login: 'octocat', role: 'editor', sessionVersion: 3 }) }) }))

interface Handler {
  onSuccess: (event: object, result: { user: Record<string, unknown> }) => Promise<string>
  onError: (event: object, error: Error) => string
}
const { default: github } = await import('../../layers/studio/server/routes/auth/github.get') as unknown as { default: Handler }
const { default: google } = await import('../../layers/studio/server/routes/auth/google.get') as unknown as { default: Handler }

const githubUser = { id: 4242, login: 'octocat', name: 'Octo Cat', avatar_url: 'https://avatars/octocat' }
const googleUser = { sub: '108976543210987654321', email: 'Octo@Example.org', email_verified: true, name: 'Octo Cat', picture: 'https://pictures/octo' }

beforeEach(() => {
  stashed = undefined
  sealed.mockReset()
  upsertOAuthLogin.mockReset()
})

describe.each([
  ['github', () => github.onSuccess({}, { user: githubUser }), 'octocat', () => github],
  ['google', () => google.onSuccess({}, { user: googleUser }), 'octo@example.org', () => google],
])('the %s handler', (provider, signIn, login, handler) => {
  it('seals the internal id, the role and the session version the store answers', async () => {
    upsertOAuthLogin.mockResolvedValue({ id: 7, role: 'editor' })
    expect(await signIn()).toBe('/')
    expect(sealed).toHaveBeenCalledWith({}, { user: expect.objectContaining({ id: 7, login, role: 'editor', sessionVersion: 3 }), activeAt: expect.any(Number) })
  })

  it('writes the login to the security log, and a failure without the message of the provider', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    upsertOAuthLogin.mockResolvedValue({ id: 7, role: 'editor' })
    await signIn()
    const line = info.mock.lastCall![0] as string
    expect(line.startsWith(`[security] login provider=${provider} account=7`)).toBe(true)
    expect(line.endsWith(`by ${login} from 127.0.0.1`)).toBe(true)
    handler().onError({}, new Error('code=secret-code'))
    expect(info).toHaveBeenLastCalledWith(`[security] login-failure provider=${provider} by anonymous from 127.0.0.1`)
    vi.restoreAllMocks()
  })

  // A session sealed from the provider's own id would name another account
  // once the internal ids and the provider ids diverge.
  it('seals nothing when the store fails', async () => {
    upsertOAuthLogin.mockRejectedValue(new Error('database is unavailable'))
    await expect(signIn()).rejects.toThrow('database is unavailable')
    expect(sealed).not.toHaveBeenCalled()
  })

  it('returns to the stashed path of this instance, and home for another site', async () => {
    upsertOAuthLogin.mockResolvedValue({ id: 7, role: 'editor' })
    stashed = '/edit/deck'
    expect(await signIn()).toBe('/edit/deck')
    stashed = '/\\other.example'
    expect(await signIn()).toBe('/')
  })
})

describe('the google handler with an unverified email', () => {
  it('creates a viewer account, whatever the role map gives the email', async () => {
    vi.stubEnv('NUXT_OWNER_LOGINS', 'octo@example.org')
    upsertOAuthLogin.mockResolvedValue({ id: 7, role: 'viewer' })
    await google.onSuccess({}, { user: { ...googleUser, email_verified: false } })
    expect(upsertOAuthLogin).toHaveBeenCalledWith(expect.objectContaining({ login: 'octo@example.org' }), 'viewer', { claimInvited: false, firstAccountOwns: false })

    await google.onSuccess({}, { user: googleUser })
    expect(upsertOAuthLogin).toHaveBeenLastCalledWith(expect.anything(), 'owner', expect.anything())
    vi.unstubAllEnvs()
  })
})
