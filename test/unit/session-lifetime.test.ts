import { sealSession } from 'h3'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { getActor, getActorFromRequest, getAppSession, openUserSession } from '../../layers/studio/server/utils/actor'
import { mintToken, useTokenStore } from '../../layers/studio/server/utils/personal-token'
import { useUserStore } from '../../layers/studio/server/utils/users'
import { asUser, seedAccount, setupServerDb, stubH3Globals } from './helpers/server-db'

stubH3Globals()
setupServerDb()

const PASSWORD = 'session-lifetime-password-with-32-chars'
const HOUR = 60 * 60 * 1000
const LOGIN = Date.UTC(2026, 9, 1, 8)

const { default: logout } = await import('../../layers/studio/server/routes/auth/logout')
const { default: changeRole } = await import('../../layers/studio/server/api/admin/users/[id].patch')
const { default: sessionActivity } = await import('../../layers/studio/server/middleware/session-activity')

/** The session configuration of the application, as nuxt-auth-utils reads it. */
let session: { maxAge: number, seal: { ttl: number } }
beforeAll(async () => {
  vi.stubGlobal('defineNuxtConfig', (config: unknown) => config)
  const { default: config } = await import('../../nuxt.config')
  session = (config.runtimeConfig as { session: typeof session }).session
  vi.stubGlobal('useRuntimeConfig', () => ({ session: { ...session, name: 'nuxt-session', password: PASSWORD } }))
})

afterEach(() => {
  vi.useRealTimers()
})

/** The cookie of a session opened at `createdAt` and sealed at the current time. */
async function cookie(createdAt: number, sessionVersion = 0): Promise<{ headers: Headers }> {
  const sealed = await sealSession(
    { context: { sessions: { 'nuxt-session': { id: 'session', createdAt, data: { user: { id: 1, login: 'alice', sessionVersion } } } } } } as any,
    { ...session, name: 'nuxt-session', password: PASSWORD },
  )
  return { headers: new Headers({ cookie: `nuxt-session=${encodeURIComponent(sealed)}` }) }
}

describe('the lifetimes of a session', () => {
  it('ends a session that no request uses for two hours', async () => {
    await seedAccount(1, 'alice', 'editor')
    vi.useFakeTimers({ toFake: ['Date'], now: LOGIN })
    const request = await cookie(LOGIN)

    vi.setSystemTime(LOGIN + 2 * HOUR - 60_000)
    await expect(getActorFromRequest(request)).resolves.toMatchObject({ id: 1, role: 'editor' })
    vi.setSystemTime(LOGIN + 2 * HOUR + 2 * 60_000)
    await expect(getActorFromRequest(request)).resolves.toEqual({ role: 'anonymous' })
  })

  it('ends a session eight hours after the login, however often it is resealed', async () => {
    await seedAccount(1, 'alice', 'editor')
    vi.useFakeTimers({ toFake: ['Date'], now: LOGIN + 7 * HOUR })
    const resealed = await cookie(LOGIN)

    await expect(getActorFromRequest(resealed)).resolves.toMatchObject({ id: 1 })
    vi.setSystemTime(LOGIN + 8 * HOUR + 60_000)
    await expect(getActorFromRequest(resealed)).resolves.toEqual({ role: 'anonymous' })
  })

  it('reseals a session on a GET request, at most every five minutes', async () => {
    await seedAccount(1, 'alice', 'editor')
    const request = (method: string, activeAt: number) => asUser(1, 'alice', { method, session: { user: { id: 1, login: 'alice' }, activeAt } })
    const minutesAgo = (n: number) => Date.now() - n * 60_000

    const recent = request('GET', minutesAgo(1))
    await sessionActivity(recent)
    expect(recent.sessionSet).toBeUndefined()
    const idle = request('GET', minutesAgo(10))
    await sessionActivity(idle)
    expect(idle.sessionSet).toEqual({ activeAt: expect.any(Number) })
    const post = request('POST', minutesAgo(10))
    await sessionActivity(post)
    expect(post.sessionSet).toBeUndefined()
  })

  it('leaves an idle session as it is on a request made with a personal token', async () => {
    await seedAccount(1, 'alice', 'editor')
    const { secret, tokenHash, prefix } = mintToken()
    await useTokenStore().create(1, { name: 'CLI', scope: 'read', tokenHash, prefix, expiresAt: new Date(Date.now() + HOUR) }, new Date())
    const request = asUser(1, 'alice', {
      method: 'GET',
      path: '/api/projects',
      headers: { authorization: `Bearer ${secret}` },
      session: { user: { id: 1, login: 'alice' }, activeAt: Date.now() - 10 * 60_000 },
    })
    await sessionActivity(request)
    expect(request.sessionSet).toBeUndefined()
  })

  it('reads the account once per request', async () => {
    await seedAccount(1, 'alice', 'editor')
    const getAccount = vi.spyOn(useUserStore(), 'getAccount')
    const event = asUser(1, 'alice', { context: {} })
    await getActor(event)
    await getActor(event)
    expect(getAccount).toHaveBeenCalledTimes(1)
    vi.restoreAllMocks()
  })
})

describe('the session version', () => {
  it('lets the logout refuse every copy of the session', async () => {
    await seedAccount(1, 'alice', 'editor')
    await logout(asUser(1, 'alice', { method: 'POST' }))

    const copy = asUser(1, 'alice')
    await expect(getActor(copy)).resolves.toEqual({ role: 'anonymous' })
    expect(copy.sessionCleared).toBe(true)
    await expect(getAppSession(asUser(1, 'alice'))).resolves.toEqual({ user: null, loggedIn: false, role: 'anonymous' })
    await expect(getActorFromRequest(await cookie(Date.now()))).resolves.toEqual({ role: 'anonymous' })
  })

  it('makes the session route of nuxt-auth-utils answer 401 for an ended session', async () => {
    const hooks: Record<string, (session: object, event: object) => Promise<void>> = {}
    vi.stubGlobal('defineNitroPlugin', (plugin: () => void) => plugin)
    vi.stubGlobal('sessionHooks', { hook: (name: string, fn: (session: object, event: object) => Promise<void>) => (hooks[name] = fn) })
    const { default: sessionCheck } = await import('../../layers/studio/server/plugins/session-check')
    ;(sessionCheck as () => void)()

    await seedAccount(1, 'alice', 'editor')
    const live = asUser(1, 'alice')
    await expect(hooks.fetch!(live.session, live)).resolves.toBeUndefined()
    await useUserStore().endSessions(1)
    const ended = asUser(1, 'alice')
    await expect(hooks.fetch!(ended.session, ended)).rejects.toMatchObject({ statusCode: 401 })
  })

  it('stays open after a GET of the logout, which a link on another site can send', async () => {
    await seedAccount(1, 'alice', 'editor')
    await expect(logout(asUser(1, 'alice'))).rejects.toMatchObject({ statusCode: 405 })
    await expect(getActor(asUser(1, 'alice'))).resolves.toMatchObject({ id: 1 })
  })

  it('ends the sessions of an account whose role changes', async () => {
    await seedAccount(1, 'alice', 'editor')
    await seedAccount(9, 'boss', 'owner')
    await changeRole(asUser(9, 'boss', { params: { id: '1' }, body: { role: 'viewer' } }))

    await expect(getActor(asUser(1, 'alice'))).resolves.toEqual({ role: 'anonymous' })
  })

  it('is sealed at login, so the next session of the account is valid', async () => {
    await seedAccount(1, 'alice', 'editor')
    await useUserStore().endSessions(1)
    const login = asUser(1, 'alice')
    await openUserSession(login, { id: 1, login: 'alice', role: 'editor' })

    expect(login.sessionSet).toEqual({ user: { id: 1, login: 'alice', role: 'editor', sessionVersion: 1 }, activeAt: expect.any(Number) })
    await expect(getActor(asUser(1, 'alice', { session: login.sessionSet }))).resolves.toEqual({ id: 1, login: 'alice', role: 'editor' })
  })
})
