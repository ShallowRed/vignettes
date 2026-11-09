import type { H3Event } from 'h3'
import { serverConfig, sessionSettings } from './config'
import { opened, sealed } from './seal'

/**
 * A signed-in person reads a private deck or a draft on the deck origin, which
 * never receives the session of the studio, with a view pass for that one deck.
 * The studio hands it over as a ticket in the address of a redirect, and
 * `/deck-pass` turns the ticket into the pass cookie of the deck origin. Both
 * are seals of `seal.ts`, and both end with the session that asked for the ticket.
 *
 * One cookie holds the passes of a person, for the decks they opened last: a
 * cookie per deck would grow the request headers past the limit of the server
 * as a person opens decks through the day.
 */

/** The account a ticket or a pass names, which the server reads again at each request. */
export interface PassIdentity {
  id: number
  login: string
  sessionVersion: number
}

interface Ticket extends PassIdentity {
  kind: 'ticket'
  slug: string
  nonce: string
  /** When the session that asked for the ticket ends, in milliseconds. */
  endsAt: number
}

interface Pass extends PassIdentity {
  kind: 'pass'
  /** The decks of the pass, the one opened last first. */
  slugs: string[]
}

/** Long enough for the redirect to `/deck-pass`. */
const TICKET_TTL_MS = 60 * 1000

/** The decks one pass names at most, which bounds the size of its cookie. */
export const PASS_DECKS = 30

/** The nonces of the tickets already redeemed, until they expire. One process serves an instance. */
const redeemed = new Map<string, number>()

/** A pass lasts as long as an idle session: the life of a session seal. */
function passLifetimeMs(): number {
  const ttl = sessionSettings().seal?.ttl
  if (!ttl)
    throw createError({ statusCode: 500, statusMessage: 'runtimeConfig.session.seal.ttl is required to seal deck passes' })
  return ttl
}

function viewPassCookieName(): string {
  // `__Host-` keeps the cookie to the host that set it, over https.
  return `${serverConfig().secureCookies ? '__Host-' : ''}view_pass`
}

function samePerson(a: PassIdentity, b: PassIdentity): boolean {
  return a.id === b.id && a.sessionVersion === b.sessionVersion
}

/** A ticket for one deck, from a session that ends at `endsAt`, in milliseconds. */
export function mintDeckTicket(identity: PassIdentity, slug: string, endsAt: number): Promise<string> {
  const { id, login, sessionVersion } = identity
  return sealed({ kind: 'ticket', id, login, sessionVersion, slug, nonce: crypto.randomUUID(), endsAt }, TICKET_TTL_MS)
}

/**
 * Adds the deck a ticket names to the pass cookie, once per ticket, when it is
 * the deck the redirect opens; `false` for a ticket that is spent, expired,
 * forged, for another deck, or of a session that has ended. A ticket of
 * another account, or of another session of the account, starts a new pass.
 */
export async function redeemDeckTicket(event: H3Event, raw: string | undefined, slug: string): Promise<boolean> {
  const ticket = await opened<Ticket>(raw, 'ticket')
  const now = Date.now()
  for (const [nonce, expiry] of redeemed) {
    if (expiry <= now)
      redeemed.delete(nonce)
  }
  if (!ticket || ticket.slug !== slug || redeemed.has(ticket.nonce))
    return false
  redeemed.set(ticket.nonce, now + TICKET_TTL_MS)

  // A pass outlives neither an idle session nor the session that asked for it.
  const lifetime = Math.min(passLifetimeMs(), ticket.endsAt - now)
  if (lifetime <= 0)
    return false
  const { id, login, sessionVersion } = ticket
  const current = await opened<Pass>(getCookie(event, viewPassCookieName()), 'pass')
  const earlier = current && samePerson(current, ticket) ? current.slugs.filter(s => s !== slug) : []
  const slugs = [slug, ...earlier].slice(0, PASS_DECKS)
  setCookie(event, viewPassCookieName(), await sealed({ kind: 'pass', id, login, sessionVersion, slugs }, lifetime), {
    httpOnly: true,
    secure: serverConfig().secureCookies,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(lifetime / 1000),
  })
  return true
}

/** The account of the pass this request carries for this deck, or `null`. */
export async function viewPassIdentity(event: H3Event, slug: string): Promise<PassIdentity | null> {
  const pass = await opened<Pass>(getCookie(event, viewPassCookieName()), 'pass')
  if (!pass?.slugs.includes(slug))
    return null
  const { id, login, sessionVersion } = pass
  return { id, login, sessionVersion }
}
