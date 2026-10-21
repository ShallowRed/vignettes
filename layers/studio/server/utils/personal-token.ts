import type { TokenScope, TokenSummary } from '#shared/access'
import type { H3Event } from 'h3'
import type { PersonalToken } from '../db/ports'
import type { Actor } from './actor'
import { createHash, randomBytes } from 'node:crypto'
import { scopeAllows, tokenRole, tokenState } from '#shared/access'
import { clientAddress } from './client-address'
import { useStores } from './db'
import { hitRateLimit, rateLimitReached } from './rate-limit'

/**
 * Personal access tokens: `Authorization: Bearer vgt_…` stands for a session of
 * the token's account on the routes of {@link TOKEN_ROUTES}, with the account's
 * role capped at editor. The secret is shown once at creation; the database
 * keeps its SHA-256: a plain SHA-256 suffices, since the secret holds 256
 * random bits.
 */
export const TOKEN_PREFIX = 'vgt_'

/** A secret as `mintToken` writes it: the prefix, then 32 bytes in base64url. */
const SECRET_PATTERN = new RegExp(`^${TOKEN_PREFIX}[\\w-]{43}$`)

/** The characters of the secret kept in clear, `vgt_` included, to name a token in the lists and the logs. */
const SHOWN_LENGTH = TOKEN_PREFIX.length + 8

export interface TokenRoute {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  /** The route as Nitro names it, `:param` for a segment of the path. */
  path: string
  scope: TokenScope
}

/** The routes that accept a personal token, and the scope each one requires. */
export const TOKEN_ROUTES: TokenRoute[] = [
  { method: 'GET', path: '/api/tokens/current', scope: 'read' },
  { method: 'DELETE', path: '/api/tokens/current', scope: 'read' },
  { method: 'GET', path: '/api/projects', scope: 'read' },
  { method: 'GET', path: '/api/presentations/:slug', scope: 'read' },
  { method: 'GET', path: '/api/presentations/:slug/markdown', scope: 'read' },
  { method: 'GET', path: '/api/content/decks', scope: 'read' },
  { method: 'POST', path: '/api/presentations', scope: 'write' },
  { method: 'PUT', path: '/api/presentations/:slug', scope: 'write' },
  { method: 'POST', path: '/api/presentations/:slug/publish', scope: 'write' },
  { method: 'POST', path: '/api/media', scope: 'write' },
  { method: 'POST', path: '/api/content/push', scope: 'write' },
  { method: 'POST', path: '/api/content/theme-rename', scope: 'write' },
]

const MINUTE = 60_000
const FAILURES_PER_CLIENT = 20
const FAILURE_WINDOW_MS = 10 * MINUTE
const REQUESTS_PER_TOKEN = 300
const REQUEST_WINDOW_MS = 5 * MINUTE

/** The database-backed `TokenStore` port. */
export function useTokenStore() {
  return useStores().tokens
}

export function hashToken(secret: string): string {
  return createHash('sha256').update(secret).digest('hex')
}

/** A new secret, its hash and the characters shown of it. */
export function mintToken(): { secret: string, tokenHash: string, prefix: string } {
  const secret = `${TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`
  return { secret, tokenHash: hashToken(secret), prefix: secret.slice(0, SHOWN_LENGTH) }
}

export function tokenSummary(token: PersonalToken, now: Date): TokenSummary {
  return {
    id: token.id,
    name: token.name,
    prefix: token.prefix,
    scope: token.scope,
    state: tokenState(token, now),
    createdAt: token.createdAt.toISOString(),
    expiresAt: token.expiresAt.toISOString(),
    lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
    revokedAt: token.revokedAt?.toISOString() ?? null,
  }
}

function matchesPath(pattern: string, path: string): boolean {
  const expected = pattern.split('/')
  const actual = path.split('/')
  return expected.length === actual.length
    && expected.every((segment, i) => segment.startsWith(':') ? actual[i] !== '' : segment === actual[i])
}

/**
 * The entry of {@link TOKEN_ROUTES} this request reaches. On a routed request,
 * the route Nitro matched must be that entry's; the path alone decides before
 * the router runs.
 */
export function tokenRouteOf(event: H3Event): TokenRoute | undefined {
  const path = event.path.split('?')[0]!
  const matched = (event.context?.matchedRoute as { path?: string } | undefined)?.path
  return TOKEN_ROUTES.find(route => route.method === event.method
    && matchesPath(route.path, path)
    && (matched === undefined || matched === route.path))
}

function refuse(statusCode: number, statusMessage: string): Error {
  return createError({ statusCode, statusMessage })
}

/** The answer to a token that does not authenticate, by its state. */
const REFUSALS: Record<string, string> = {
  unreadable: 'Unreadable personal token',
  unknown: 'Unknown personal token',
  revoked: 'Personal token revoked',
  expired: 'Personal token expired',
}

/** One authentication per request: the middlewares and the guards of a route ask several times. */
const authenticated = new WeakMap<H3Event, Promise<Actor | null>>()

/**
 * The account of a request that carries a personal token, null for any other
 * request, whatever the route. Refuses an unknown, revoked or expired token
 * (401), and a client or a token over its rate limit (429).
 */
export function authenticatePersonalToken(event: H3Event): Promise<Actor | null> {
  let actor = authenticated.get(event)
  if (!actor) {
    actor = authenticate(event)
    authenticated.set(event, actor)
  }
  return actor
}

/**
 * The actor of a request that carries a personal token, null for any other
 * request. Adds to {@link authenticatePersonalToken} the refusal of a route
 * outside {@link TOKEN_ROUTES} or beyond the token's scope (403), checked on the
 * route the request reaches at the time of the call.
 */
export async function personalTokenActor(event: H3Event): Promise<Actor | null> {
  const actor = await authenticatePersonalToken(event)
  if (!actor?.token)
    return null
  const route = tokenRouteOf(event)
  if (!route)
    throw refuse(403, 'This route does not accept a personal token')
  if (!scopeAllows(actor.token.scope, route.scope))
    throw refuse(403, `The ${actor.token.scope} scope of this token does not allow this route`)
  return actor
}

async function authenticate(event: H3Event): Promise<Actor | null> {
  const header = getRequestHeader(event, 'authorization') ?? ''
  const secret = /^Bearer\s+(\S.*)$/i.exec(header)?.[1]
  if (!secret?.startsWith(TOKEN_PREFIX))
    return null

  const failures = `token-failure:${clientAddress(event)}`
  if (rateLimitReached(failures, FAILURES_PER_CLIENT))
    throw refuse(429, 'Too many invalid tokens, try again later')

  const now = new Date()
  const readable = SECRET_PATTERN.test(secret)
  const token = readable ? await useTokenStore().findByHash(hashToken(secret)) : null
  const state = token ? tokenState(token, now) : readable ? 'unknown' : 'unreadable'
  if (!token || state !== 'active') {
    console.warn(`[token] refused ${secret.slice(0, SHOWN_LENGTH)} (${state})`)
    hitRateLimit(failures, FAILURES_PER_CLIENT, FAILURE_WINDOW_MS)
    throw refuse(401, REFUSALS[state]!)
  }

  if (!hitRateLimit(`token:${token.id}`, REQUESTS_PER_TOKEN, REQUEST_WINDOW_MS))
    throw refuse(429, 'Too many requests with this token, try again later')

  if (!token.lastUsedAt || now.getTime() - token.lastUsedAt.getTime() >= MINUTE)
    await useTokenStore().touch(token.id, now)

  return {
    id: token.userId,
    login: token.holder.login,
    role: tokenRole(token.holder.role),
    token: { id: token.id, name: token.name, prefix: token.prefix, scope: token.scope, expiresAt: token.expiresAt },
  }
}
