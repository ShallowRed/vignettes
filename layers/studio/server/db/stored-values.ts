import type { DeckGrant, PublicationStatus, Role } from '#shared/access'
import { PublicationStatusSchema } from '@vignettes/core/status'
import { DeckGrantSchema, RoleSchema } from '../../shared/access/roles.ts'

/** How the adapters read the values they store: an invalid one fails closed. */

/** An invalid stored status fails closed. */
export function readStatus(value: string): PublicationStatus {
  const parsed = PublicationStatusSchema.safeParse(value)
  return parsed.success ? parsed.data : 'private'
}

/** An invalid stored grant degrades to view-only. */
export function readGrant(value: string): DeckGrant {
  const parsed = DeckGrantSchema.safeParse(value)
  return parsed.success ? parsed.data : 'viewer'
}

/** A stored role that fails validation degrades to the least-privileged one. */
export function readRole(value: string): Role {
  const parsed = RoleSchema.safeParse(value)
  return parsed.success ? parsed.data : 'viewer'
}
