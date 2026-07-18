import type { Role } from '#shared/access'
import type { H3Event } from 'h3'
import process from 'node:process'
import { readRoleMap, resolveRole } from '#shared/access'
import { unsealSession } from 'h3'
import { useUserStore } from './users'

interface SessionUser {
  id?: number
  login?: string
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

/** The actor's `Role` for an H3 request; `anonymous` when no session. */
export async function getActorRole(event: H3Event): Promise<Role> {
  const session = await getUserSession(event).catch(() => null)
  return resolveActorRole(session?.user as SessionUser | undefined)
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
export async function getActorRoleFromRequest(request: Request): Promise<Role> {
  const config = useRuntimeConfig().session as { name?: string, password?: string, maxAge?: number }
  const name = config?.name || 'nuxt-session'
  const password = config?.password || process.env.NUXT_SESSION_PASSWORD
  const sealed = readCookie(request.headers.get('cookie'), name)
  if (!sealed || !password)
    return 'anonymous'

  const session = await unsealSession(undefined as never, { password, maxAge: config?.maxAge }, sealed)
    .catch(() => null)
  return resolveActorRole((session?.data as { user?: SessionUser })?.user)
}
