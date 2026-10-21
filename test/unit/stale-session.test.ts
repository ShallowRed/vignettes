import process from 'node:process'
import { sealSession } from 'h3'
import { beforeEach, describe, expect, it } from 'vitest'
import { getActor, getAppSession } from '../../layers/studio/server/utils/actor'
import { useDeckMeta, usePermissionStore } from '../../layers/studio/server/utils/sources'
import { useUserStore } from '../../layers/studio/server/utils/users'
import { asUser, seedAccount, setupServerDb, stubH3Globals } from './helpers/server-db'

// A sealed session names its account by id and login. Once the account is
// removed, or its id names another login, a request with that cookie is anonymous.
stubH3Globals()
setupServerDb()
process.env.NUXT_SESSION_PASSWORD = 'stale-session-password-with-32-chars'

const { default: removeUser } = await import('../../layers/studio/server/api/admin/users/[id].delete')
const { default: collab } = await import('../../layers/studio/server/routes/collab')

const google = (login: string) => ({ provider: 'google' as const, providerId: `sub-${login}`, login })

/** The session cookie nuxt-auth-utils sets for this identity. */
async function sessionCookie(id: number, login: string): Promise<string> {
  const session = { id: 'session', createdAt: Date.now(), data: { user: { id, login } } }
  const sealed = await sealSession({ context: { sessions: { 'nuxt-session': session } } } as any, { name: 'nuxt-session', password: process.env.NUXT_SESSION_PASSWORD! })
  return `nuxt-session=${encodeURIComponent(sealed)}`
}

const knock = async (cookie: string) => collab.upgrade!(new Request('http://localhost/collab?deck=deck', { headers: { cookie, origin: 'http://localhost' } }) as any)

/** Eve's account, removed by the owner, then Zoe's, created after, with an editor grant on `deck`. */
async function removeEveThenAddZoe() {
  await seedAccount(1, 'boss', 'owner')
  const eve = await useUserStore().upsertOAuthLogin(google('eve@example.com'), 'editor')
  await removeUser(asUser(1, 'boss', { params: { id: String(eve.id) } }))
  const zoe = await useUserStore().upsertOAuthLogin(google('zoe@example.com'), 'viewer')
  await usePermissionStore().set('deck', zoe.id, 'editor', 'boss')
  return { eve, zoe }
}

beforeEach(async () => {
  await useDeckMeta().update('deck', { title: 'Deck' })
})

describe('the session of a removed account', () => {
  it('is anonymous once another account exists, and is cleared', async () => {
    const { eve } = await removeEveThenAddZoe()
    const event = asUser(eve.id, 'eve@example.com')
    await expect(getActor(event)).resolves.toEqual({ role: 'anonymous' })
    expect(event.sessionCleared).toBe(true)
    await expect(getAppSession(asUser(eve.id, 'eve@example.com'))).resolves.toEqual({ user: null, loggedIn: false, role: 'anonymous' })
  })

  it('cannot open the collab socket', async () => {
    const { eve, zoe } = await removeEveThenAddZoe()
    await expect(knock(await sessionCookie(eve.id, 'eve@example.com'))).rejects.toMatchObject({ status: 401 })
    await expect(knock(await sessionCookie(zoe.id, 'zoe@example.com'))).resolves.toBeUndefined()
  })
})

describe('a session whose id names another login', () => {
  beforeEach(async () => {
    await seedAccount(7, 'zoe', 'editor')
    await usePermissionStore().set('deck', 7, 'editor', 'boss')
  })

  it('is anonymous, and is cleared', async () => {
    const event = asUser(7, 'eve')
    await expect(getActor(event)).resolves.toEqual({ role: 'anonymous' })
    expect(event.sessionCleared).toBe(true)
    await expect(getActor(asUser(7, 'zoe'))).resolves.toEqual({ id: 7, login: 'zoe', role: 'editor' })
  })

  it('cannot open the collab socket', async () => {
    await expect(knock(await sessionCookie(7, 'eve'))).rejects.toMatchObject({ status: 401 })
  })
})
