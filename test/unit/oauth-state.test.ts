import { createError, createEvent } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { stubH3Globals } from './helpers/server-db'

// The OAuth handlers of nuxt-auth-utils bind a callback to the browser that
// started the sign-in by the `nuxt-auth-state` cookie. Without that check, a
// page of another site signs its visitor in to an account of its choosing
// (GHSA-xc49-mgwh-9pjv, fixed in 0.5.30, and GHSA-889p-xjqp-6559, fixed in 0.5.32).
// The routes run with the handlers of the library.
vi.mock('#imports', () => ({
  createError,
  useRuntimeConfig: () => ({
    oauth: {
      github: { clientId: 'client', clientSecret: 'secret' },
      google: { clientId: 'client', clientSecret: 'secret' },
    },
  }),
}))

const { defineOAuthGitHubEventHandler } = await import('../../node_modules/nuxt-auth-utils/dist/runtime/server/lib/oauth/github.js')
const { defineOAuthGoogleEventHandler } = await import('../../node_modules/nuxt-auth-utils/dist/runtime/server/lib/oauth/google.js')
stubH3Globals()
vi.stubGlobal('defineOAuthGitHubEventHandler', defineOAuthGitHubEventHandler)
vi.stubGlobal('defineOAuthGoogleEventHandler', defineOAuthGoogleEventHandler)

// The token request of the library goes through the `$fetch` of Nitro.
const tokenRequest = vi.fn()
vi.stubGlobal('$fetch', tokenRequest)

const upsertOAuthLogin = vi.fn()
vi.mock('../../layers/studio/server/utils/users', () => ({ useUserStore: () => ({ upsertOAuthLogin }) }))

type Route = (event: ReturnType<typeof createEvent>) => Promise<unknown>
const { default: github } = await import('../../layers/studio/server/routes/auth/github.get') as unknown as { default: Route }
const { default: google } = await import('../../layers/studio/server/routes/auth/google.get') as unknown as { default: Route }

function callback(path: string, cookie?: string) {
  const headers: Record<string, string> = { host: 'studio.example' }
  if (cookie)
    headers.cookie = cookie
  return createEvent({ method: 'GET', url: path, headers } as any, { setHeader() {}, getHeader() {} } as any)
}

beforeEach(() => {
  // A provider that refuses the code: a handler that requests a token still
  // reaches `onError`, and the test fails on `tokenRequest`.
  tokenRequest.mockReset().mockResolvedValue({ error: 'invalid_grant' })
  upsertOAuthLogin.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

describe.each([
  ['github', () => github, '/auth/github'],
  ['google', () => google, '/auth/google'],
])('the %s route', (_provider, route, path) => {
  it.each([
    ['without a state, and no state cookie', `${path}?code=attacker`, undefined],
    ['with a state, and no state cookie', `${path}?code=attacker&state=forged`, undefined],
    ['with a state that differs from the cookie', `${path}?code=attacker&state=forged`, 'nuxt-auth-state=started'],
  ])('refuses a callback %s, before any token request, account or session', async (_case, url, cookie) => {
    const event = callback(url, cookie) as any
    await route()(event)
    expect(event.redirectedTo).toBe('/login?error=oauth_failed')
    expect(tokenRequest).not.toHaveBeenCalled()
    expect(upsertOAuthLogin).not.toHaveBeenCalled()
    expect(event.sessionSet).toBeUndefined()
  })

  // The control case: with the state of its cookie, the same callback reaches
  // the token request, so the refusals above come from the state check.
  it('requests a token for a callback whose state matches the cookie', async () => {
    await route()(callback(`${path}?code=code&state=started`, 'nuxt-auth-state=started'))
    expect(tokenRequest).toHaveBeenCalledTimes(1)
  })
})
