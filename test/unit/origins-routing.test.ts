import process from 'node:process'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { viewPassIdentity } from '../../layers/studio/server/utils/deck-pass'
import { deckOfPagePath, useDbContent, useDeckMeta, usePermissionStore } from '../../layers/studio/server/utils/sources'
import { nitroRoutes, samplePath } from './helpers/nitro-routes'
import { anon, asUser, seedAccount, setupServerDb, stubH3Globals } from './helpers/server-db'

// The studio sends a deck page to the deck origin, with a ticket for a person
// the studio knows; the deck origin sends every other page back.
stubH3Globals()
setupServerDb()
vi.stubGlobal('getRequestURL', (e: any) => new URL(`http://${e.headers?.host ?? 'app.example'}${e.path ?? '/'}`))
vi.stubGlobal('useRuntimeConfig', () => ({ public: {}, session: { seal: { ttl: 2 * 60 * 60 * 1000 } } }))
process.env.NUXT_SESSION_PASSWORD = 'origins-routing-password-with-32-chars'

beforeAll(() => {
  process.env.NUXT_PUBLIC_DECKS_URL = 'http://decks.example'
  process.env.NUXT_STUDIO_URL = 'http://app.example'
})

const { default: origins } = await import('../../layers/studio/server/middleware/00.origins')
const { default: deckPass } = await import('../../layers/studio/server/routes/deck-pass.get')

const DECKS = { host: 'decks.example' }
const STUDIO = { host: 'app.example' }
/** The headers of a link the person follows in the studio. */
const CLICK = { 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document', 'sec-fetch-site': 'same-origin' }

beforeEach(async () => {
  await seedAccount(2, 'ana', 'viewer')
  await useDbContent().writer.save({ slug: 'secret', raw: '---\ntitle: Secret\n---\n\n# Secret', actor: 'test' })
  await useDeckMeta().update('secret', { title: 'Secret', status: 'private', published: true })
  await usePermissionStore().set('secret', 2, 'viewer', 'boss')
})

afterAll(() => {
  delete process.env.NUXT_PUBLIC_DECKS_URL
  delete process.env.NUXT_STUDIO_URL
})

describe('the deck origin', () => {
  it('sends a page of the studio to the studio, and lets the deck routes through', async () => {
    const page = anon({ context: {}, method: 'GET', path: '/edit/secret?slide=2', headers: DECKS })
    await origins(page)
    expect(page.redirectedTo).toBe('http://app.example/edit/secret?slide=2')
    expect(page.context.originSide).toBe('decks')
    for (const path of ['/slides/secret', '/api/presentations/secret', '/_og/d/slides/secret', '/deck-pass?ticket=t']) {
      const event = anon({ context: {}, method: 'GET', path, headers: DECKS })
      await origins(event)
      expect(event.redirectedTo, path).toBeUndefined()
    }
    const upper = anon({ context: {}, method: 'GET', path: '/Slides/secret', headers: DECKS })
    await origins(upper)
    expect(upper.redirectedTo).toBe('http://app.example/Slides/secret')
  })

  it('refuses every write of the studio (404), and lets the two unlock routes through', async () => {
    const writes = nitroRoutes().filter(route => !/^(?:GET|HEAD) /.test(route))
    expect(writes.length).toBeGreaterThan(30)
    for (const route of writes) {
      const [method, pattern] = route.split(' ') as [string, string]
      const answer = origins(anon({ context: {}, method, path: samplePath(pattern), headers: DECKS }))
      if (/\/unlock$/.test(pattern) && method === 'POST')
        await expect(answer, route).resolves.toBeUndefined()
      else
        await expect(answer, route).rejects.toMatchObject({ statusCode: 404 })
    }
  })
})

describe('another address of the instance', () => {
  it('sends every request to the studio for good, and lets the loopback address through', async () => {
    const platform = anon({ context: {}, method: 'GET', path: '/edit/secret?slide=2', headers: { host: 'app.platform.example' } })
    await origins(platform)
    expect(platform.redirectedTo).toBe('http://app.example/edit/secret?slide=2')
    expect(platform.redirectCode).toBe(301)
    for (const host of ['127.0.0.1:3000', 'localhost:3000']) {
      const health = anon({ context: {}, method: 'GET', path: '/', headers: { host } })
      await origins(health)
      expect(health.redirectedTo, host).toBeUndefined()
    }
  })
})

describe('a deck page of the studio', () => {
  it('goes to the deck origin, with a ticket for a person who may read the deck', async () => {
    const anonymous = anon({ context: {}, method: 'GET', path: '/slides/secret?draft', headers: STUDIO })
    await origins(anonymous)
    expect(anonymous.redirectedTo).toBe('http://decks.example/slides/secret?draft')

    const click = asUser(2, 'ana', { context: {}, method: 'GET', path: '/slides/secret', headers: { ...STUDIO, ...CLICK } })
    await origins(click)
    const target = new URL(click.redirectedTo)
    expect(`${target.origin}${target.pathname}`).toBe('http://decks.example/deck-pass')
    expect(target.searchParams.get('to')).toBe('/slides/secret')

    const redeem = anon({ headers: DECKS, query: Object.fromEntries(target.searchParams) })
    await deckPass(redeem)
    expect(redeem.redirectedTo).toBe('/slides/secret')
    expect(redeem.responseHeaders).toMatchObject({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' })
    await expect(viewPassIdentity(anon({ cookies: redeem.setCookies }), 'secret')).resolves.toMatchObject({ login: 'ana' })
  })

  it('gives a ticket for an address typed in the address bar', async () => {
    const typed = asUser(2, 'ana', { context: {}, method: 'GET', path: '/p/secret-2026', headers: { ...STUDIO, ...CLICK, 'sec-fetch-site': 'none' } })
    await useDeckMeta().update('secret', { alias: 'secret-2026' })
    await origins(typed)
    expect(new URL(typed.redirectedTo).pathname).toBe('/deck-pass')
  })

  it.each([
    ['a page of the same site', { 'sec-fetch-site': 'same-site' }],
    ['a page of another site', { 'sec-fetch-site': 'cross-site' }],
    ['a frame', { 'sec-fetch-dest': 'iframe' }],
    ['a fetch', { 'sec-fetch-mode': 'no-cors', 'sec-fetch-dest': 'empty' }],
  ])('gives no ticket to a request that %s makes', async (_from, headers) => {
    const event = asUser(2, 'ana', { context: {}, method: 'GET', path: '/slides/secret', headers: { ...STUDIO, ...CLICK, ...headers } })
    await origins(event)
    expect(event.redirectedTo).toBe('http://decks.example/slides/secret')
  })

  it('gives no ticket for a deck the person may not read', async () => {
    await usePermissionStore().remove('secret', 2)
    const event = asUser(2, 'ana', { context: {}, method: 'GET', path: '/slides/secret', headers: { ...STUDIO, ...CLICK } })
    await origins(event)
    expect(event.redirectedTo).toBe('http://decks.example/slides/secret')
  })
})

describe('/deck-pass', () => {
  it('sets no pass when the page names another deck, and answers on the deck origin alone', async () => {
    const click = asUser(2, 'ana', { context: {}, method: 'GET', path: '/slides/secret', headers: { ...STUDIO, ...CLICK } })
    await origins(click)
    const ticket = new URL(click.redirectedTo).searchParams.get('ticket')
    const other = anon({ headers: DECKS, query: { ticket, to: '/slides/other' } })
    await deckPass(other)
    expect(other.setCookies).toBeUndefined()
    await expect(deckPass(anon({ headers: STUDIO, query: { ticket, to: '/slides/secret' } }))).rejects.toMatchObject({ statusCode: 404 })
  })

  it.each(['//evil.example/slides/secret', '/\\evil.example', 'https://evil.example/slides/secret'])('opens no other site for %s', async (to) => {
    const event = anon({ headers: DECKS, query: { ticket: 'x', to } })
    await deckPass(event)
    expect(event.redirectedTo).toBe('/')
  })
})

describe('deckOfPagePath', () => {
  it('names the deck of each kind of page', async () => {
    await useDeckMeta().update('secret', { alias: 'secret-2026', frozenBundle: 'secret-bundle' })
    expect(await deckOfPagePath('/slides/secret')).toBe('secret')
    expect(await deckOfPagePath('/slides/secret-2026/')).toBe('secret')
    expect(await deckOfPagePath('/slides/%73ecret')).toBe('secret')
    expect(await deckOfPagePath('/unlock/secret?return=/slides/secret')).toBe('secret')
    expect(await deckOfPagePath('/p/secret-2026')).toBe('secret')
    expect(await deckOfPagePath('/p/none')).toBeNull()
    expect(await deckOfPagePath('/frozen/secret-bundle/slides/secret--standalone/')).toBe('secret')
    expect(await deckOfPagePath('/slides/%E0%A4%A')).toBeNull()
    expect(await deckOfPagePath('/edit/secret')).toBeNull()
  })
})

describe('an instance with one origin', () => {
  it('sends nothing anywhere', async () => {
    const decks = process.env.NUXT_PUBLIC_DECKS_URL
    delete process.env.NUXT_PUBLIC_DECKS_URL
    try {
      const event = anon({ context: {}, method: 'GET', path: '/slides/secret', headers: STUDIO })
      await origins(event)
      expect(event.redirectedTo).toBeUndefined()
      expect(event.context.originSide).toBe('single')
    }
    finally {
      process.env.NUXT_PUBLIC_DECKS_URL = decks
    }
  })
})
