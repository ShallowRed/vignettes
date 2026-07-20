import type { AppSession, Role } from '#shared/access'
import type { H3Event } from 'h3'
import process from 'node:process'
import { readRoleMap, resolveRole } from '#shared/access'
import { unsealSession } from 'h3'
import { useUserStore } from './users'

interface SessionUser {
  id?: number
  login?: string
}

/** The resolved actor: session identity + runtime role (database-first). */
export interface Actor {
  id?: number
  login?: string
  role: Role
}

/**
 * Resolve the actor's role from the session identity, database first. A missing
 * row or an unreachable database falls back to the env login map — never to the
 * role sealed in the session, so a revoked privilege cannot survive via a stale
 * cookie, and a wiped database self-heals from the bootstrap map.
 */
async function resolveActorRole(user: SessionUser | undefined): Promise<Role> {
  if (!user?.id)
    return 'anonymous'
  const fromMap = () => resolveRole(user.login, readRoleMap())
  try {
    return await useUserStore().getRole(user.id) ?? fromMap()
  }
  catch {
    return fromMap()
  }
}

/** The actor for an H3 request; anonymous (no identity) when no session. */
export async function getActor(event: H3Event): Promise<Actor> {
  const session = await getUserSession(event).catch(() => null)
  const user = session?.user as SessionUser | undefined
  return { id: user?.id, login: user?.login, role: await resolveActorRole(user) }
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
  const session = await getUserSession(event).catch(() => null)
  return {
    user: session?.user || null,
    loggedIn: !!session?.user,
    role: await getActorRole(event),
  }
}

function readCookie(header: string | null, name: string): string | undefined {
  const entry = header?.split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`))
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : undefined
}

/**
 * `getActorRole` for a web-standard `Request` (WebSocket upgrades have no
 * H3Event): unseal the nuxt-auth-utils session cookie directly. The password
 * falls back to the env var because runtimeConfig only merges it at first
 * `getUserSession` call.
 */
export async function getActorFromRequest(request: Request): Promise<Actor> {
  const config = useRuntimeConfig().session as { name?: string, password?: string, maxAge?: number }
  const name = config?.name || 'nuxt-session'
  const password = config?.password || process.env.NUXT_SESSION_PASSWORD
  const sealed = readCookie(request.headers.get('cookie'), name)
  if (!sealed || !password)
    return { role: 'anonymous' }

  const session = await unsealSession(undefined as never, { password, maxAge: config?.maxAge }, sealed)
    .catch(() => null)
  const user = (session?.data as { user?: SessionUser })?.user
  return { id: user?.id, login: user?.login, role: await resolveActorRole(user) }
}
