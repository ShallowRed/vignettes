import { beforeEach, describe, expect, it, vi } from 'vitest'

// The handlers run inside nuxt-auth-utils: `defineOAuth*EventHandler` receives
// the callbacks and routes a rejected `onSuccess` to `onError`. The stub hands
// the callbacks back so the test drives `onSuccess` itself.
vi.stubGlobal('defineOAuthGitHubEventHandler', (handler: unknown) => handler)
vi.stubGlobal('defineOAuthGoogleEventHandler', (handler: unknown) => handler)
const sealed = vi.fn()
vi.stubGlobal('setUserSession', sealed)
let stashed: string | undefined
vi.stubGlobal('getCookie', () => stashed)
vi.stubGlobal('deleteCookie', () => {})
vi.stubGlobal('sendRedirect', (_event: unknown, to: string) => to)

const upsertOAuthLogin = vi.fn()
vi.mock('../../layers/studio/server/utils/users', () => ({ useUserStore: () => ({ upsertOAuthLogin }) }))

interface Handler { onSuccess: (event: object, result: { user: Record<string, unknown> }) => Promise<string> }
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
  ['github', () => github.onSuccess({}, { user: githubUser }), 'octocat'],
  ['google', () => google.onSuccess({}, { user: googleUser }), 'octo@example.org'],
])('the %s handler', (_provider, signIn, login) => {
  it('seals the internal id and the role the store answers', async () => {
    upsertOAuthLogin.mockResolvedValue({ id: 7, role: 'editor' })
    expect(await signIn()).toBe('/')
    expect(sealed).toHaveBeenCalledWith({}, { user: expect.objectContaining({ id: 7, login, role: 'editor' }) })
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
