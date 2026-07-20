import { z } from 'zod'

/**
 * Actor roles. `anonymous` models "no session" as a real matrix row; `viewer` is
 * an authenticated user with the same read rights as anonymous (product decision).
 */
export const RoleSchema = z.enum(['owner', 'editor', 'viewer', 'anonymous'])
export type Role = z.infer<typeof RoleSchema>

/** Roles allowed to see drafts/private decks, edit, and reach the admin area. */
export function isPrivileged(role: Role): boolean {
  return role === 'owner' || role === 'editor'
}

/** Per-deck grant escalating a user beyond their global role, on that deck only. */
export const DeckGrantSchema = z.enum(['editor', 'viewer'])
export type DeckGrant = z.infer<typeof DeckGrantSchema>

/** The UI-facing session: identity for display + resolved runtime `role` for gating. */
export interface AppSession {
  loggedIn: boolean
  role: Role
  user: { login?: string, name?: string, avatar?: string } | null
}
