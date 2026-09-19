import process from 'node:process'
import { beforeEach, describe, expect, it } from 'vitest'
import { assertCanEditDeck, assertOwner, assertPrivileged, gateDeckAccess } from '../../layers/studio/server/utils/access'
import { accessCookieName, mintAccessPass, verifyAccessPass } from '../../layers/studio/server/utils/access-pass'
import { hashAccessPassword } from '../../layers/studio/server/utils/password'
import { resetRateLimits } from '../../layers/studio/server/utils/rate-limit'
import { useDeckMeta, usePermissionStore } from '../../layers/studio/server/utils/sources'
import { anon, asUser, seedAccount, setupServerDb, stubH3Globals } from './helpers/server-db'

stubH3Globals()
setupServerDb()
process.env.NUXT_SESSION_PASSWORD = 'access-test-password-with-32-characters'
beforeEach(resetRateLimits)

describe('assertOwner', () => {
  it('rejects an anonymous request with 401', async () => {
    await expect(assertOwner(anon())).rejects.toMatchObject({ statusCode: 401 })
  })

  it('rejects a non-owner with 403', async () => {
    await seedAccount(2, 'viewer', 'viewer')
    await expect(assertOwner(asUser(2, 'viewer'))).rejects.toMatchObject({ statusCode: 403 })
  })

  it('allows an owner', async () => {
    await seedAccount(1, 'boss', 'owner')
    await expect(assertOwner(asUser(1, 'boss'))).resolves.toMatchObject({ role: 'owner' })
  })
})

describe('assertPrivileged', () => {
  it('rejects anonymous (401) and a viewer (403), allows an editor', async () => {
    await expect(assertPrivileged(anon())).rejects.toMatchObject({ statusCode: 401 })
    await seedAccount(2, 'viewer', 'viewer')
    await expect(assertPrivileged(asUser(2, 'viewer'))).rejects.toMatchObject({ statusCode: 403 })
    await seedAccount(3, 'ed', 'editor')
    await expect(assertPrivileged(asUser(3, 'ed'))).resolves.toMatchObject({ role: 'editor' })
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
    await seedAccount(2, 'viewer', 'viewer')
    await expect(assertCanEditDeck(asUser(2, 'viewer'), 'deck')).rejects.toMatchObject({ statusCode: 403 })
  })

  it('allows a global editor', async () => {
    await seedAccount(3, 'ed', 'editor')
    await expect(assertCanEditDeck(asUser(3, 'ed'), 'deck')).resolves.toMatchObject({ role: 'editor' })
  })

  it('allows a viewer holding an editor grant on the deck', async () => {
    await seedAccount(2, 'viewer', 'viewer')
    await usePermissionStore().set('deck', 2, 'editor', 'boss')
    await expect(assertCanEditDeck(asUser(2, 'viewer'), 'deck')).resolves.toMatchObject({ id: 2 })
  })

  it('rejects a viewer whose grant is only viewer (403)', async () => {
    await seedAccount(2, 'viewer', 'viewer')
    await usePermissionStore().set('deck', 2, 'viewer', 'boss')
    await expect(assertCanEditDeck(asUser(2, 'viewer'), 'deck')).rejects.toMatchObject({ statusCode: 403 })
  })

  it('treats a trashed deck as absent (404), even for an owner', async () => {
    await seedAccount(1, 'boss', 'owner')
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
    await seedAccount(1, 'boss', 'owner')
    await expect(gateDeckAccess(asUser(1, 'boss'), { slug: 'd', status: 'private' })).resolves.toBeUndefined()
  })

  it('asks for a password on a semi-private deck with no grant', async () => {
    const storedHash = await hashAccessPassword('open-sesame')
    await expect(gateDeckAccess(anon(), { slug: 'd', status: 'semi-private', storedHash }))
      .rejects
      .toMatchObject({ statusCode: 401, data: { requiresPassword: true } })
  })

  it('unlocks a semi-private deck with the right password and sets a signed cookie', async () => {
    const storedHash = await hashAccessPassword('open-sesame')
    const event = anon({ query: { password: 'open-sesame' } })
    await expect(gateDeckAccess(event, { slug: 'd', status: 'semi-private', storedHash })).resolves.toBeUndefined()
    expect(verifyAccessPass(event.setCookies?.access_d, 'd', storedHash)).toBe(true)
  })

  it('reopens the deck on a later request carrying that cookie', async () => {
    const storedHash = await hashAccessPassword('open-sesame')
    const cookies = { [accessCookieName('d')]: mintAccessPass('d', storedHash).value }
    await expect(gateDeckAccess(anon({ cookies }), { slug: 'd', status: 'semi-private', storedHash })).resolves.toBeUndefined()
  })

  it('still asks for the password when the cookie is a made-up value', async () => {
    const storedHash = await hashAccessPassword('open-sesame')
    const cookies = { [accessCookieName('d')]: 'granted' }
    await expect(gateDeckAccess(anon({ cookies }), { slug: 'd', status: 'semi-private', storedHash }))
      .rejects
      .toMatchObject({ statusCode: 401, data: { requiresPassword: true } })
  })

  it('refuses a cookie minted for another deck', async () => {
    const storedHash = await hashAccessPassword('open-sesame')
    const cookies = { [accessCookieName('d')]: mintAccessPass('other', storedHash).value }
    await expect(gateDeckAccess(anon({ cookies }), { slug: 'd', status: 'semi-private', storedHash }))
      .rejects
      .toMatchObject({ statusCode: 401, data: { requiresPassword: true } })
  })

  it('refuses a cookie minted before the deck password changed', async () => {
    const previous = await hashAccessPassword('open-sesame')
    const rotated = await hashAccessPassword('new-secret')
    const cookies = { [accessCookieName('d')]: mintAccessPass('d', previous).value }
    await expect(gateDeckAccess(anon({ cookies }), { slug: 'd', status: 'semi-private', storedHash: rotated }))
      .rejects
      .toMatchObject({ statusCode: 401, data: { requiresPassword: true } })
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
