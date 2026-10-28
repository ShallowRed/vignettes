import { z } from 'zod'

/**
 * Actor roles. `anonymous` models "no session" as a real matrix row; `viewer` is
 * an authenticated user with the same read rights as anonymous (product decision).
 */
export const RoleSchema = z.enum(['owner', 'editor', 'viewer', 'anonymous'])
export type Role = z.infer<typeof RoleSchema>

/** The roles an account holds; `anonymous` is the absence of one. */
export const AccountRoleSchema = RoleSchema.exclude(['anonymous'])
export type AccountRole = z.infer<typeof AccountRoleSchema>
/** Weakest first, the order of the role pickers. */
export const ACCOUNT_ROLES: readonly AccountRole[] = [...AccountRoleSchema.options].reverse()

/** Roles allowed to see drafts/private decks, edit, and reach the admin area. */
export function isPrivileged(role: Role): boolean {
  return role === 'owner' || role === 'editor'
}

/** A grant escalating a user beyond their global role, on one deck or a whole project. */
export const DeckGrantSchema = z.enum(['editor', 'viewer'])
export type DeckGrant = z.infer<typeof DeckGrantSchema>

/** Higher wins when a user holds grants from several scopes (deck + its project). */
const GRANT_RANK: Record<DeckGrant, number> = { viewer: 1, editor: 2 }

/**
 * The strongest of two grants (or `undefined` when neither is set). Used to fold a
 * per-deck grant with the grant a user holds on the deck's project — a project grant
 * is a master key that opens every deck in the project, so the stronger scope wins.
 */
export function strongerGrant(a?: DeckGrant, b?: DeckGrant): DeckGrant | undefined {
  if (!a)
    return b
  if (!b)
    return a
  return GRANT_RANK[a] >= GRANT_RANK[b] ? a : b
}

/** The UI-facing session: identity for display + resolved runtime `role` for gating. */
export interface AppSession {
  loggedIn: boolean
  role: Role
  user: { login?: string, name?: string, avatar?: string } | null
}
