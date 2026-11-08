import type { AppSession, Role, TokenScope } from '#shared/access'
import type { H3Event } from 'h3'
import { resolveRole } from '#shared/access'
import { unsealSession } from 'h3'
import { serverConfig, sessionSettings } from './config'
import { requestSide } from './deck-origin'
import { viewPassIdentity } from './deck-pass'
import { authenticatePersonalToken, personalTokenActor } from './personal-token'
import { useUserStore } from './users'

interface SessionUser {
  id?: number
  login?: string
  /** The `sessionVersion` of the account when the session opened. */
  sessionVersion?: number
}

/** The fields of a session that this module reads. */
interface SessionData {
  user?: SessionUser
  /** When a request last resealed the session, in milliseconds. */
  activeAt?: number
}

/**
 * The longest time between two reseals of a session in use. A seal expires
 * `session.seal.ttl` after it is made (nuxt.config.ts): a session that no
 * request uses for that long ends.
 */
const RESEAL_EVERY_MS = 5 * 60 * 1000

/** The resolved actor: session identity + runtime role (database-first). */
export interface Actor {
  id?: number
  login?: string
  role: Role
  /** The personal token the request carries, when it authenticates by one. */
  token?: { id: number, name: string, prefix: string, scope: TokenScope, expiresAt: Date }
}

/** The actor as a log line names it: the login, and the token it used. */
export function actorLabel(actor: Actor | null | undefined): string {
  if (!actor?.login)
    return 'anonymous'
  return actor.token ? `${actor.login} via ${actor.token.prefix}` : actor.login
}

const ANONYMOUS: Actor = { role: 'anonymous' }

/**
 * The actor of a session identity, its role read from the database. `null` for
 * a stale session: its account is removed, or its id names another login, or
 * the account ended its sessions after this one opened (logout, role change). An
 * unreachable database falls back to the env login map, never to the role
 * sealed in the session, so a revoked privilege cannot survive via a stale cookie.
 */
async function resolveActor(user: SessionUser | undefined): Promise<Actor | null> {
  if (!user?.id)
    return ANONYMOUS
  let account
  try {
    account = await useUserStore().getAccount(user.id)
  }
  catch {
    return { id: user.id, login: user.login, role: resolveRole(user.login, serverConfig().roleMap) }
  }
  if (!account || account.login !== user.login || account.sessionVersion !== (user.sessionVersion ?? 0))
    return null
  return { id: user.id, login: user.login, role: account.role }
}

/** The actor of a request read from its session cookie, which it clears when the session is stale or ended. */
async function readActor(event: H3Event): Promise<Actor> {
  if (!getCookie(event, sessionSettings().name))
    return ANONYMOUS
  const session = await getUserSession(event).catch(() => null) as SessionData | null
  const actor = await resolveActor(session?.user)
  if (actor)
    return actor
  await clearUserSession(event)
  return ANONYMOUS
}

/**
 * The actor for an H3 request: the account of its personal token, else of its
 * session; anonymous without either, with a stale or ended session, and on the
 * deck origin, which holds no session of the studio. `getActor` keeps it in
 * `event.context.actor` for the rest of the request, so that the middlewares
 * and the route read the account once.
 */
export async function getActor(event: H3Event): Promise<Actor> {
  if (event.context?.actor)
    return event.context.actor as Actor
  const actor = requestSide(event) === 'decks'
    ? ANONYMOUS
    : await personalTokenActor(event) ?? await readActor(event)
  if (event.context)
    event.context.actor = actor
  return actor
}

/**
 * The actor of a request on one deck. On the deck origin, it is the account of
 * the view pass of that deck, read again from the database, so that a logout or
 * a role change ends the pass; elsewhere, `getActor`. It stays out of
 * `event.context.actor`, which names the actor of the request on every deck.
 */
export async function getDeckActor(event: H3Event, slug: string): Promise<Actor> {
  if (requestSide(event) !== 'decks')
    return await getActor(event)
  const identity = await viewPassIdentity(event, slug)
  return identity ? await resolveActor(identity) ?? ANONYMOUS : ANONYMOUS
}

/**
 * Reseals the session of a signed-in actor at most every `RESEAL_EVERY_MS`, so
 * that its seal expires one idle lifetime after its last request. The
 * `session-activity` middleware calls it on each `GET` request.
 */
export async function keepSessionActive(event: H3Event): Promise<void> {
  // A request made with a personal token leaves the session as it is, and its
  // route is checked once the router has matched it.
  if (await authenticatePersonalToken(event))
    return
  if (!(await getActor(event)).id)
    return
  const session = await getUserSession(event) as SessionData
  const now = Date.now()
  if (now - (session.activeAt ?? 0) >= RESEAL_EVERY_MS)
    await setUserSession(event, { activeAt: now })
}

/** The user a login seals in its session. */
interface LoginUser {
  id: number
  login: string
  name?: string | null
  avatar?: string | null
  role: Role
}

/**
 * Opens the session of a login, which carries the current version of the
 * account. `replaceUserSession` replaces the data of the session; h3 keeps the
 * id and the `createdAt` of a session the request already carries.
 */
export async function openUserSession(event: H3Event, user: LoginUser): Promise<void> {
  const sessionVersion = (await useUserStore().getAccount(user.id))?.sessionVersion ?? 0
  await replaceUserSession(event, { user: { ...user, sessionVersion }, activeAt: Date.now() })
  delete event.context?.actor
}

/**
 * When the session of this request ends whatever its use, in milliseconds:
 * `maxAge` after the `createdAt` that h3 seals with the session and from which
 * it expires it. `null` for a request without a session cookie.
 */
export async function sessionEndsAt(event: H3Event): Promise<number | null> {
  const { name, password, maxAge, seal } = sessionSettings()
  if (!maxAge || !password || !getCookie(event, name))
    return null
  const { createdAt } = await getSession(event, { name, password, maxAge, seal })
  return createdAt ? createdAt + maxAge * 1000 : null
}

/** The actor's `Role` for an H3 request; `anonymous` when no session. */
export async function getActorRole(event: H3Event): Promise<Role> {
  return (await getActor(event)).role
}

/**
 * The UI-facing session for an H3 request: identity (from the sealed session) +
 * runtime role (database-first). The single source for both `/api/auth/session`
 * and the SSR seed, so the header renders the same branch on server and client.
 */
export async function getAppSession(event: H3Event): Promise<AppSession> {
  const actor = await getActor(event)
  const session = actor.id ? await getUserSession(event).catch(() => null) : null
  return {
    user: session?.user || null,
    loggedIn: !!session?.user,
    role: actor.role,
  }
}

function readCookie(header: string | null, name: string): string | undefined {
  const entry = header?.split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`))
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : undefined
}

/** All this reader needs of a request: the cookie header. */
interface RequestWithCookies {
  headers: { get: (name: string) => string | null }
}

/**
 * `getActor` for a request that carries no H3Event, which is every WebSocket
 * upgrade: unseal the nuxt-auth-utils session cookie directly, with the same
 * lifetimes. A stale or ended session is anonymous; the next HTTP request
 * clears it.
 */
export async function getActorFromRequest(request: RequestWithCookies): Promise<Actor> {
  const { name, password, maxAge, seal } = sessionSettings()
  const sealed = readCookie(request.headers.get('cookie'), name)
  if (!sealed || !password)
    return { role: 'anonymous' }

  const session = await unsealSession(undefined as never, { password, maxAge, seal }, sealed)
    .catch(() => null)
  return await resolveActor((session?.data as SessionData | undefined)?.user) ?? ANONYMOUS
}
