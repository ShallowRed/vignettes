import type { H3Event, SessionConfig } from 'h3'
import { defaults, seal, unseal } from 'iron-webcrypto'
import { serverConfig } from './config'

/**
 * A signed-in person reads a private deck or a draft on the deck origin, which
 * never receives the session of the studio, with a view pass for that one deck.
 * The studio hands it over as a ticket in the address of a redirect, and
 * `/deck-pass` turns the ticket into the pass cookie of the deck origin. Both
 * are iron seals, as the sessions of h3 are, under the session secret.
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
}

interface Pass extends PassIdentity {
  kind: 'pass'
  /** The decks of the pass, the one opened last first. */
  slugs: string[]
}

type Sealed = Ticket | Pass

/** Long enough for the redirect to `/deck-pass`. */
const TICKET_TTL_MS = 60 * 1000

/** The decks one pass names at most, which bounds the size of its cookie. */
export const PASS_DECKS = 30

/** The nonces of the tickets already redeemed, until they expire. One process serves an instance. */
const redeemed = new Map<string, number>()

function secret(): string {
  const value = serverConfig().sessionPassword
  if (!value)
    throw createError({ statusCode: 500, statusMessage: 'NUXT_SESSION_PASSWORD is required to seal deck passes' })
  return value
}

/** A pass lasts as long as an idle session: the life of a session seal. */
function passLifetimeMs(): number {
  const ttl = (useRuntimeConfig().session as Partial<SessionConfig> | undefined)?.seal?.ttl
  if (!ttl)
    throw createError({ statusCode: 500, statusMessage: 'runtimeConfig.session.seal.ttl is required to seal deck passes' })
  return ttl
}

// iron-webcrypto declares the Web Crypto it takes with its own interface, whose
// `Uint8Array` the global one of the TypeScript library does not match: the
// value is the Web Crypto of Node, the one h3 passes it.
const webCrypto = globalThis.crypto as unknown as Parameters<typeof seal>[0]

function sealed(value: Sealed, ttl: number): Promise<string> {
  return seal(webCrypto, value, secret(), { ...defaults, ttl })
}

async function opened<K extends Sealed['kind']>(raw: string | undefined, kind: K): Promise<Extract<Sealed, { kind: K }> | null> {
  if (!raw)
    return null
  // The server that seals is the one that opens: no clock skew to allow for.
  const value = await unseal(webCrypto, raw, secret(), { ...defaults, timestampSkewSec: 0 }).catch(() => null) as Sealed | null
  return value?.kind === kind ? value as Extract<Sealed, { kind: K }> : null
}

export function viewPassCookieName(): string {
  // `__Host-` keeps the cookie to the host that set it, over https.
  return `${serverConfig().secureCookies ? '__Host-' : ''}view_pass`
}

function samePerson(a: PassIdentity, b: PassIdentity): boolean {
  return a.id === b.id && a.sessionVersion === b.sessionVersion
}

export function mintDeckTicket(identity: PassIdentity, slug: string): Promise<string> {
  const { id, login, sessionVersion } = identity
  return sealed({ kind: 'ticket', id, login, sessionVersion, slug, nonce: crypto.randomUUID() }, TICKET_TTL_MS)
}

/**
 * Adds the deck a ticket names to the pass cookie, once per ticket, when it is
 * the deck the redirect opens; `false` for a ticket that is spent, expired,
 * forged or for another deck. A ticket of another account, or of another
 * session of the account, starts a new pass.
 */
export async function redeemDeckTicket(event: H3Event, raw: string | undefined, slug: string): Promise<boolean> {
  const ticket = await opened(raw, 'ticket')
  const now = Date.now()
  for (const [nonce, expiry] of redeemed) {
    if (expiry <= now)
      redeemed.delete(nonce)
  }
  if (!ticket || ticket.slug !== slug || redeemed.has(ticket.nonce))
    return false
  redeemed.set(ticket.nonce, now + TICKET_TTL_MS)

  const lifetime = passLifetimeMs()
  const { id, login, sessionVersion } = ticket
  const current = await opened(getCookie(event, viewPassCookieName()), 'pass')
  const earlier = current && samePerson(current, ticket) ? current.slugs.filter(s => s !== slug) : []
  const slugs = [slug, ...earlier].slice(0, PASS_DECKS)
  setCookie(event, viewPassCookieName(), await sealed({ kind: 'pass', id, login, sessionVersion, slugs }, lifetime), {
    httpOnly: true,
    secure: serverConfig().secureCookies,
    sameSite: 'lax',
    path: '/',
    maxAge: lifetime / 1000,
  })
  return true
}

/** The account of the pass this request carries for this deck, or `null`. */
export async function viewPassIdentity(event: H3Event, slug: string): Promise<PassIdentity | null> {
  const pass = await opened(getCookie(event, viewPassCookieName()), 'pass')
  if (!pass?.slugs.includes(slug))
    return null
  const { id, login, sessionVersion } = pass
  return { id, login, sessionVersion }
}
