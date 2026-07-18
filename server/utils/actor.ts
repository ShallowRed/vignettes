import type { Role } from '#shared/access'
import type { H3Event } from 'h3'
import process from 'node:process'
import { unsealSession } from 'h3'

/** Read the actor's `Role` off the session (set at login); `anonymous` when none. */
export async function getActorRole(event: H3Event): Promise<Role> {
  const session = await getUserSession(event).catch(() => null)
  const role = (session?.user as { role?: Role } | undefined)?.role
  return role ?? 'anonymous'
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
  const role = ((session?.data as { user?: { role?: Role } })?.user)?.role
  return role ?? 'anonymous'
}
