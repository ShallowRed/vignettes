import type { Role } from '#shared/access'
import type { H3Event } from 'h3'

/** Read the actor's `Role` off the session (set at login); `anonymous` when none. */
export async function getActorRole(event: H3Event): Promise<Role> {
  const session = await getUserSession(event).catch(() => null)
  const role = (session?.user as { role?: Role } | undefined)?.role
  return role ?? 'anonymous'
}
