import type { DeckGrant, GrantTerm } from '#shared/access'
import { mayGrantUntil } from '#shared/access'

/**
 * Whether a sharer whose own access ends at `limit` (null: never, undefined: not
 * known yet) may give `role` to an existing grant, which keeps its expiry.
 */
export function mayChangeRole(limit: Date | null | undefined, grant: GrantTerm, role: DeckGrant): boolean {
  return limit !== undefined && mayGrantUntil(limit, { role, expiresAt: grant.expiresAt ?? null }, grant)
}
