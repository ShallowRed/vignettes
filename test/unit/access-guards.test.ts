import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { deckDrafts, deckPermissions, decks, deckVersions, users } from '../../server/db/schema'
import { assertCanEditDeck, assertOwner, gateDeckAccess } from '../../server/utils/access'
import { useDb } from '../../server/utils/db'
import { hashAccessPassword } from '../../server/utils/password'
import { resetRateLimits } from '../../server/utils/rate-limit'
import { useDeckMeta, usePermissionStore } from '../../server/utils/sources'
import { useUserStore } from '../../server/utils/users'
import { useMigratedTestDb } from './helpers/server-db'

// The guards read identity, cookies, query and IP through h3/Nitro auto-imports.
// Stub them to read from the event object each test builds, so a test drives the
// whole guard by describing the request — no HTTP server, but the real code path.
vi.stubGlobal('getUserSession', async (e: any) => e.session ?? null)
vi.stubGlobal('createError', (e: any) => Object.assign(new Error(e.statusMessage), e))
vi.stubGlobal('getCookie', (e: any, name: string) => e.cookies?.[name])
vi.stubGlobal('getQuery', (e: any) => e.query ?? {})
vi.stubGlobal('setCookie', (e: any, name: string, value: string) => {
  ;(e.setCookies ??= {})[name] = value
})
vi.stubGlobal('getRequestIP', (e: any) => e.ip ?? '127.0.0.1')

/** An H3-ish event authenticated as the given user (role read from the db). */
function asUser(id: number, login: string, over: Record<string, unknown> = {}) {
  return { session: { user: { id, login } }, ...over }
}
/** An anonymous H3-ish event. */
function anon(over: Record<string, unknown> = {}) {
  return { ...over }
}

async function seedUser(id: number, login: string, role: 'owner' | 'editor' | 'viewer') {
  await useUserStore().upsertOnLogin({ id, login }, role)
}

let cleanup: () => void

beforeAll(() => {
  cleanup = useMigratedTestDb()
})

beforeEach(() => {
  const db = useDb()
  db.delete(deckPermissions).run()
  db.delete(deckVersions).run()
  db.delete(deckDrafts).run()
  db.delete(decks).run()
  db.delete(users).run()
  resetRateLimits()
})

afterAll(() => cleanup())

describe('assertOwner', () => {
  it('rejects an anonymous request with 401', async () => {
    await expect(assertOwner(anon())).rejects.toMatchObject({ statusCode: 401 })
  })

  it('rejects a non-owner with 403', async () => {
    await seedUser(2, 'viewer', 'viewer')
    await expect(assertOwner(asUser(2, 'viewer'))).rejects.toMatchObject({ statusCode: 403 })
  })

  it('allows an owner', async () => {
    await seedUser(1, 'boss', 'owner')
    await expect(assertOwner(asUser(1, 'boss'))).resolves.toMatchObject({ role: 'owner' })
  })
})

describe('assertCanEditDeck', () => {
  beforeEach(async () => {
    await useDeckMeta().update('deck', { title: 'Deck' })
  })

  it('rejects anonymous with 401', async () => {
    await expect(assertCanEditDeck(anon(), 'deck')).rejects.toMatchObject({ statusCode: 401 })
  })

  it('rejects a viewer with no grant (403)', async () => {
    await seedUser(2, 'viewer', 'viewer')
    await expect(assertCanEditDeck(asUser(2, 'viewer'), 'deck')).rejects.toMatchObject({ statusCode: 403 })
  })

  it('allows a global editor', async () => {
    await seedUser(3, 'ed', 'editor')
    await expect(assertCanEditDeck(asUser(3, 'ed'), 'deck')).resolves.toMatchObject({ role: 'editor' })
  })

  it('allows a viewer holding an editor grant on the deck', async () => {
    await seedUser(2, 'viewer', 'viewer')
    await usePermissionStore().set('deck', 2, 'editor', 'boss')
    await expect(assertCanEditDeck(asUser(2, 'viewer'), 'deck')).resolves.toMatchObject({ id: 2 })
  })

  it('rejects a viewer whose grant is only viewer (403)', async () => {
    await seedUser(2, 'viewer', 'viewer')
    await usePermissionStore().set('deck', 2, 'viewer', 'boss')
    await expect(assertCanEditDeck(asUser(2, 'viewer'), 'deck')).rejects.toMatchObject({ statusCode: 403 })
  })

  it('treats a trashed deck as absent (404), even for an owner', async () => {
    await seedUser(1, 'boss', 'owner')
    await useDeckMeta().softDelete('deck')
    await expect(assertCanEditDeck(asUser(1, 'boss'), 'deck')).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('gateDeckAccess', () => {
  it('allows anyone on a public deck', async () => {
    await expect(gateDeckAccess(anon(), { slug: 'd', status: 'public' })).resolves.toBeUndefined()
  })

  it('denies an anonymous visitor on a private deck (401)', async () => {
    await expect(gateDeckAccess(anon(), { slug: 'd', status: 'private' })).rejects.toMatchObject({ statusCode: 401 })
  })

  it('allows an owner on a private deck', async () => {
    await seedUser(1, 'boss', 'owner')
    await expect(gateDeckAccess(asUser(1, 'boss'), { slug: 'd', status: 'private' })).resolves.toBeUndefined()
  })

  it('asks for a password on a semi-private deck with no grant', async () => {
    const storedHash = await hashAccessPassword('open-sesame')
    await expect(gateDeckAccess(anon(), { slug: 'd', status: 'semi-private', storedHash }))
      .rejects
      .toMatchObject({ statusCode: 401, data: { requiresPassword: true } })
  })

  it('unlocks a semi-private deck with the right password and sets a cookie', async () => {
    const storedHash = await hashAccessPassword('open-sesame')
    const event = anon({ query: { password: 'open-sesame' } })
    await expect(gateDeckAccess(event, { slug: 'd', status: 'semi-private', storedHash })).resolves.toBeUndefined()
    expect((event as any).setCookies?.access_d).toBe('granted')
  })

  it('throttles password guessing to 429 after the limit', async () => {
    const storedHash = await hashAccessPassword('open-sesame')
    const wrong = () => gateDeckAccess(anon({ query: { password: 'nope' }, ip: '10.0.0.9' }), { slug: 'd', status: 'semi-private', storedHash })
    // 10 wrong tries are answered as bad-password (401); the 11th is rate-limited.
    for (let i = 0; i < 10; i++)
      await expect(wrong()).rejects.toMatchObject({ statusCode: 401 })
    await expect(wrong()).rejects.toMatchObject({ statusCode: 429 })
  })
})
