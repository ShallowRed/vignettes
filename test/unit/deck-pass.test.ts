import process from 'node:process'
import { sealSession } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mintDeckTicket, PASS_DECKS, redeemDeckTicket, viewPassIdentity } from '../../layers/studio/server/utils/deck-pass'
import { anon, stubH3Globals } from './helpers/server-db'

stubH3Globals()
vi.stubGlobal('useRuntimeConfig', () => ({ session: { seal: { ttl: 2 * 60 * 60 * 1000 } } }))
process.env.NUXT_SESSION_PASSWORD = 'deck-pass-password-with-32-characters!'

const ANA = { id: 7, login: 'ana', sessionVersion: 2 }

/** The end of a session opened now, which lasts eight hours. */
const signedInUntil = () => Date.now() + 8 * 60 * 60 * 1000

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
})
afterEach(() => {
  vi.useRealTimers()
})

/** The request of the deck origin that carries the cookies a redeem set. */
function carrying(event: any): any {
  return anon({ cookies: event.setCookies })
}

describe('a deck ticket', () => {
  it('sets the view pass of its deck once', async () => {
    const ticket = await mintDeckTicket(ANA, 'talk', signedInUntil())
    const event = anon()
    await expect(redeemDeckTicket(event, ticket, 'talk')).resolves.toBe(true)
    await expect(viewPassIdentity(carrying(event), 'talk')).resolves.toEqual(ANA)
    await expect(redeemDeckTicket(anon(), ticket, 'talk')).resolves.toBe(false)
  })

  it('sets no pass for a deck other than its own', async () => {
    const event = anon()
    await expect(redeemDeckTicket(event, await mintDeckTicket(ANA, 'talk', signedInUntil()), 'other')).resolves.toBe(false)
    expect(event.setCookies).toBeUndefined()
  })

  it('expires after a minute', async () => {
    const ticket = await mintDeckTicket(ANA, 'talk', signedInUntil())
    vi.advanceTimersByTime(61 * 1000)
    await expect(redeemDeckTicket(anon(), ticket, 'talk')).resolves.toBe(false)
  })

  it('is refused when forged, and neither a pass nor a session is a ticket', async () => {
    await expect(redeemDeckTicket(anon(), 'Fe26.2**forged', 'talk')).resolves.toBe(false)
    const session = { id: 'session', createdAt: Date.now(), data: { user: { id: 7, login: 'ana' } } }
    const sealedSession = await sealSession({ context: { sessions: { 'nuxt-session': session } } } as any, { name: 'nuxt-session', password: process.env.NUXT_SESSION_PASSWORD! })
    await expect(redeemDeckTicket(anon(), sealedSession, 'talk')).resolves.toBe(false)
    const event = anon()
    await redeemDeckTicket(event, await mintDeckTicket(ANA, 'talk', signedInUntil()), 'talk')
    await expect(redeemDeckTicket(anon(), event.setCookies.view_pass, 'talk')).resolves.toBe(false)
  })
})

describe('a view pass', () => {
  it('opens the decks of its tickets alone', async () => {
    const event = anon()
    await redeemDeckTicket(event, await mintDeckTicket(ANA, 'talk', signedInUntil()), 'talk')
    await expect(viewPassIdentity(carrying(event), 'other')).resolves.toBeNull()
  })

  it('keeps the decks a person opened last in one cookie of a bounded size', async () => {
    let event = anon()
    for (let i = 0; i <= PASS_DECKS; i++) {
      const slug = `deck-with-a-slug-of-thirty-${String(i).padStart(2, '0')}`
      const next = carrying(event)
      await redeemDeckTicket(next, await mintDeckTicket(ANA, slug, signedInUntil()), slug)
      event = { setCookies: { ...event.setCookies, ...next.setCookies } }
    }
    expect(Object.keys(event.setCookies)).toEqual(['view_pass'])
    expect(event.setCookies.view_pass.length).toBeLessThan(4096)
    await expect(viewPassIdentity(carrying(event), `deck-with-a-slug-of-thirty-${PASS_DECKS}`)).resolves.toEqual(ANA)
    await expect(viewPassIdentity(carrying(event), 'deck-with-a-slug-of-thirty-01')).resolves.toEqual(ANA)
    await expect(viewPassIdentity(carrying(event), 'deck-with-a-slug-of-thirty-00')).resolves.toBeNull()
  })

  it('starts again for another account or another session', async () => {
    const first = anon()
    await redeemDeckTicket(first, await mintDeckTicket(ANA, 'talk', signedInUntil()), 'talk')
    const second = carrying(first)
    await redeemDeckTicket(second, await mintDeckTicket({ ...ANA, sessionVersion: 3 }, 'other', signedInUntil()), 'other')
    await expect(viewPassIdentity(carrying(second), 'other')).resolves.toEqual({ ...ANA, sessionVersion: 3 })
    await expect(viewPassIdentity(carrying(second), 'talk')).resolves.toBeNull()
  })

  it('is not a ticket turned into a cookie', async () => {
    const ticket = await mintDeckTicket(ANA, 'talk', signedInUntil())
    await expect(viewPassIdentity(anon({ cookies: { view_pass: ticket } }), 'talk')).resolves.toBeNull()
  })

  it('lasts as long as an idle session', async () => {
    const event = anon()
    await redeemDeckTicket(event, await mintDeckTicket(ANA, 'talk', signedInUntil()), 'talk')
    vi.advanceTimersByTime(2 * 60 * 60 * 1000 + 1000)
    await expect(viewPassIdentity(carrying(event), 'talk')).resolves.toBeNull()
  })

  it('ends with the session that asked for its ticket', async () => {
    const event = anon()
    await redeemDeckTicket(event, await mintDeckTicket(ANA, 'talk', Date.now() + 10 * 1000), 'talk')
    vi.advanceTimersByTime(11 * 1000)
    await expect(viewPassIdentity(carrying(event), 'talk')).resolves.toBeNull()
  })

  it('is refused to the ticket of a session that has ended', async () => {
    const ticket = await mintDeckTicket(ANA, 'talk', Date.now())
    const event = anon()
    await expect(redeemDeckTicket(event, ticket, 'talk')).resolves.toBe(false)
    expect(event.setCookies).toBeUndefined()
  })
})
