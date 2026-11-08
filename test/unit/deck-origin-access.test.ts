import process from 'node:process'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getActor } from '../../layers/studio/server/utils/actor'
import { mintDeckTicket, redeemDeckTicket } from '../../layers/studio/server/utils/deck-pass'
import { useDbContent, useDeckMeta, usePermissionStore } from '../../layers/studio/server/utils/sources'
import { useUserStore } from '../../layers/studio/server/utils/users'
import { anon, asUser, bearer, seedAccount, setupServerDb, stubH3Globals } from './helpers/server-db'

// On the deck origin a request carries no session of the studio: a signed-in
// person reads a deck with the view pass of that deck, which names the account.
stubH3Globals()
setupServerDb()
vi.stubGlobal('getRequestURL', (e: any) => new URL(`http://${e.headers?.host ?? 'app.example'}${e.path ?? '/'}`))
vi.stubGlobal('useRuntimeConfig', () => ({ public: {}, session: { maxAge: 8 * 60 * 60, seal: { ttl: 2 * 60 * 60 * 1000 } } }))
process.env.NUXT_SESSION_PASSWORD = 'deck-origin-password-with-32-characters'

beforeAll(() => {
  process.env.NUXT_PUBLIC_DECKS_URL = 'http://decks.example'
  process.env.NUXT_STUDIO_URL = 'http://app.example'
})
afterAll(() => {
  delete process.env.NUXT_PUBLIC_DECKS_URL
  delete process.env.NUXT_STUDIO_URL
})

const { default: getDeck } = await import('../../layers/studio/server/api/presentations/[slug].get')
const { default: getViewer } = await import('../../layers/studio/server/api/presentations/[slug]/viewer.get')

const DECKS = { host: 'decks.example' }

/** A request of the deck origin, with the pass a ticket for this account and deck set. */
async function withPass(id: number, login: string, slug: string, over: Record<string, any> = {}) {
  const redeem = anon({ headers: DECKS })
  await redeemDeckTicket(redeem, await mintDeckTicket({ id, login, sessionVersion: 0 }, slug, Date.now() + 8 * 60 * 60 * 1000), slug)
  return anon({ headers: DECKS, params: { slug }, ...over, cookies: redeem.setCookies })
}

beforeEach(async () => {
  await seedAccount(2, 'ana', 'viewer')
  for (const slug of ['secret', 'other']) {
    await useDbContent().writer.save({ slug, raw: `---\ntitle: ${slug}\n---\n\n# ${slug}`, actor: 'test' })
    await useDeckMeta().update(slug, { title: slug, status: 'private', published: true })
  }
  await usePermissionStore().set('secret', 2, 'viewer', 'boss')
})

describe('the deck origin', () => {
  it('reads no session of the studio', async () => {
    await expect(getActor(asUser(2, 'ana', { headers: DECKS }))).resolves.toEqual({ role: 'anonymous' })
    await expect(getActor(asUser(2, 'ana', { headers: { host: 'app.example' } }))).resolves.toMatchObject({ login: 'ana' })
    await expect(getActor(bearer('vgn_any', { headers: { ...DECKS, authorization: 'Bearer vgn_any' } }))).resolves.toEqual({ role: 'anonymous' })
  })

  it('opens a private deck to the account of its view pass', async () => {
    await expect(getDeck(await withPass(2, 'ana', 'secret'))).resolves.toMatchObject({ status: 'private' })
    await expect(getDeck(anon({ headers: DECKS, params: { slug: 'secret' } }))).rejects.toMatchObject({ statusCode: 401 })
  })

  it('keeps a pass to its deck', async () => {
    await usePermissionStore().set('other', 2, 'viewer', 'boss')
    const event = await withPass(2, 'ana', 'secret', { params: { slug: 'other' } })
    await expect(getDeck(event)).rejects.toMatchObject({ statusCode: 401 })
  })

  it('ends a pass when its account logs out', async () => {
    const event = await withPass(2, 'ana', 'secret')
    await useUserStore().endSessions(2)
    await expect(getDeck(event)).rejects.toMatchObject({ statusCode: 401 })
  })

  it('opens the draft to the pass of an editor alone', async () => {
    await expect(getDeck(await withPass(2, 'ana', 'secret', { query: { draft: '' } }))).rejects.toMatchObject({ statusCode: 403 })
    await usePermissionStore().set('secret', 2, 'editor', 'boss')
    await expect(getDeck(await withPass(2, 'ana', 'secret', { query: { draft: '' } }))).resolves.toMatchObject({ from: 'published' })
  })

  it('lists the variants an anonymous visitor may open, whatever the pass', async () => {
    await useDeckMeta().update('secret', { family: 'Conf', variantLabel: 'FR' })
    await useDeckMeta().update('other', { family: 'Conf', variantLabel: 'EN' })
    await usePermissionStore().set('other', 2, 'viewer', 'boss')
    await expect(getViewer(await withPass(2, 'ana', 'secret'))).resolves.toMatchObject({ variants: [] })
    await expect(getViewer(asUser(2, 'ana', { headers: { host: 'app.example' }, params: { slug: 'secret' } }))).resolves.toMatchObject({ variants: [{ slug: 'secret' }, { slug: 'other' }] })
  })

  it('tells the deck page who reads it', async () => {
    await expect(getViewer(await withPass(2, 'ana', 'secret'))).resolves.toMatchObject({ signedIn: true, canEdit: false })
    await expect(getViewer(anon({ headers: DECKS, params: { slug: 'secret' } }))).resolves.toMatchObject({ signedIn: false })
  })
})
