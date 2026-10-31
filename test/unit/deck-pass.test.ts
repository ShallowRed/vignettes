import process from 'node:process'
import { sealSession } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mintDeckTicket, redeemDeckTicket, viewPassIdentity } from '../../layers/studio/server/utils/deck-pass'
import { anon, stubH3Globals } from './helpers/server-db'

stubH3Globals()
vi.stubGlobal('useRuntimeConfig', () => ({ session: { seal: { ttl: 2 * 60 * 60 * 1000 } } }))
process.env.NUXT_SESSION_PASSWORD = 'deck-pass-password-with-32-characters!'

const ANA = { id: 7, login: 'ana', sessionVersion: 2 }

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
    const ticket = await mintDeckTicket(ANA, 'talk')
    const event = anon()
    await expect(redeemDeckTicket(event, ticket, 'talk')).resolves.toBe(true)
    await expect(viewPassIdentity(carrying(event), 'talk')).resolves.toEqual(ANA)
    await expect(redeemDeckTicket(anon(), ticket, 'talk')).resolves.toBe(false)
  })

  it('sets no pass for a deck other than its own', async () => {
    const event = anon()
    await expect(redeemDeckTicket(event, await mintDeckTicket(ANA, 'talk'), 'other')).resolves.toBe(false)
    expect(event.setCookies).toBeUndefined()
  })

  it('expires after a minute', async () => {
    const ticket = await mintDeckTicket(ANA, 'talk')
    vi.advanceTimersByTime(61 * 1000)
    await expect(redeemDeckTicket(anon(), ticket, 'talk')).resolves.toBe(false)
  })

  it('is refused when forged, and neither a pass nor a session is a ticket', async () => {
    await expect(redeemDeckTicket(anon(), 'Fe26.2**forged', 'talk')).resolves.toBe(false)
    const session = { id: 'session', createdAt: Date.now(), data: { user: { id: 7, login: 'ana' } } }
    const sealedSession = await sealSession({ context: { sessions: { 'nuxt-session': session } } } as any, { name: 'nuxt-session', password: process.env.NUXT_SESSION_PASSWORD! })
    await expect(redeemDeckTicket(anon(), sealedSession, 'talk')).resolves.toBe(false)
    const event = anon()
    await redeemDeckTicket(event, await mintDeckTicket(ANA, 'talk'), 'talk')
    await expect(redeemDeckTicket(anon(), event.setCookies.view_talk, 'talk')).resolves.toBe(false)
  })
})

describe('a view pass', () => {
  it('opens its deck alone, even under the cookie name of another deck', async () => {
    const event = anon()
    await redeemDeckTicket(event, await mintDeckTicket(ANA, 'talk'), 'talk')
    await expect(viewPassIdentity(carrying(event), 'other')).resolves.toBeNull()
    await expect(viewPassIdentity(anon({ cookies: { view_other: event.setCookies.view_talk } }), 'other')).resolves.toBeNull()
  })

  it('is not a ticket turned into a cookie', async () => {
    const ticket = await mintDeckTicket(ANA, 'talk')
    await expect(viewPassIdentity(anon({ cookies: { view_talk: ticket } }), 'talk')).resolves.toBeNull()
  })

  it('lasts as long as an idle session', async () => {
    const event = anon()
    await redeemDeckTicket(event, await mintDeckTicket(ANA, 'talk'), 'talk')
    vi.advanceTimersByTime(2 * 60 * 60 * 1000 + 1000)
    await expect(viewPassIdentity(carrying(event), 'talk')).resolves.toBeNull()
  })
})
