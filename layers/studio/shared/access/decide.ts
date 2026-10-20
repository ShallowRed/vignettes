import type { DeckGrant, Role } from './roles'
import type { Lifecycle, PublicationStatus } from './status'
import { isPrivileged } from './roles'

/**
 * Pure access decision — no I/O, crypto, or session lookup. The server adapter
 * (`server/utils/access.ts`) computes `passwordGranted` and `role`, then calls in.
 *
 * view matrix: public → allow all; semi-private → allow if password granted (deny
 * if no hash set); draft/private → privileged only. Lifecycle and `unlisted` only
 * affect listing (see canList), never view.
 */

export type AccessAction = 'view' | 'list' | 'admin' | 'edit'

export interface AccessInput {
  status: PublicationStatus
  lifecycle?: Lifecycle
  role: Role
  /** Defaults to `view`. */
  action?: AccessAction
  /** Per-deck grant for this actor, resolved by the caller (no I/O here). */
  grant?: DeckGrant
  hasPassword: boolean
  passwordGranted: boolean
}

export type AccessDecision
  = | { outcome: 'allow' }
    | { outcome: 'deny', reason: 'not-found' | 'auth-required' | 'forbidden' }
    | { outcome: 'needs-password' }

export function decideAccess(input: AccessInput): AccessDecision {
  const { status, role, grant, hasPassword, passwordGranted } = input
  const action = input.action ?? 'view'

  // Grants escalate on one deck: any grant opens view, `editor` opens edit.
  // Admin stays global-role only.
  if (action === 'admin')
    return isPrivileged(role) ? { outcome: 'allow' } : denyFor(role)

  if (action === 'edit') {
    return isPrivileged(role) || grant === 'editor'
      ? { outcome: 'allow' }
      : denyFor(role)
  }

  if (isPrivileged(role) || grant)
    return { outcome: 'allow' }

  switch (status) {
    case 'public':
      return { outcome: 'allow' }
    case 'semi-private':
      // Fail-closed: no hash means no way to grant access, so deny rather than
      // expose a semi-private deck whose accessPassword is missing.
      if (!hasPassword)
        return denyFor(role)
      return passwordGranted ? { outcome: 'allow' } : { outcome: 'needs-password' }
    case 'private':
      return denyFor(role)
    default:
      return { outcome: 'deny', reason: 'forbidden' }
  }
}

/**
 * Anonymous is asked to sign in; a signed-in actor is refused. The HTTP adapter
 * maps the two to 401 and, on the view gate, to the 404 of an absent deck.
 */
function denyFor(role: Role): AccessDecision {
  return { outcome: 'deny', reason: role === 'anonymous' ? 'auth-required' : 'forbidden' }
}

export interface ListInput {
  status: PublicationStatus
  lifecycle?: Lifecycle
  role: Role
  grant?: DeckGrant
  unlisted?: boolean
}

/**
 * Whether a deck appears in the catalog for `role`. Listing is the discoverability
 * axis, distinct from view (see decideAccess): the public catalog is a showcase of
 * `public` decks only — semi-private/private are hidden from unprivileged visitors,
 * titles included, and reached solely by direct link. Privileged roles and per-deck
 * grantees see the deck regardless; unlisted/archived are always hidden from the
 * public showcase.
 */
export function canList(input: ListInput): boolean {
  const { status, lifecycle, role, grant, unlisted } = input
  if (isPrivileged(role) || grant)
    return true
  if (unlisted || lifecycle === 'archived')
    return false
  return status === 'public'
}

/**
 * Whether the actor may write: a privileged role, or an `editor` grant on the
 * target (a deck, or the folder a new deck goes into). Every server-side edit
 * check and every edit affordance in the catalog goes through this one rule.
 */
export function mayEdit(role: Role, grant?: DeckGrant): boolean {
  return decideAccess({ status: 'private', role, action: 'edit', grant, hasPassword: false, passwordGranted: false }).outcome === 'allow'
}

/**
 * Whether the actor may manage the per-deck grants of a deck: list them, add a
 * `viewer` or `editor` grant, change its role or expiry, remove it, and invite a
 * provider handle onto the deck. Whoever may edit the deck may share it, so a
 * team shares its decks without going through the owner. A grant never exceeds
 * `editor`; folder grants, global roles and the list of accounts stay with the
 * owner.
 */
export function canShare(role: Role, grant?: DeckGrant): boolean {
  return mayEdit(role, grant)
}

/**
 * Whether a sharer may write the grant of the account `userId`. The owner writes
 * any grant; another sharer never writes their own. Removing it stays open to
 * everyone.
 */
export function mayWriteGrantOf(sharer: { role: Role, id?: number }, userId: number): boolean {
  return sharer.role === 'owner' || sharer.id !== userId
}

/** A grant as the sharing rules read it: its role, and its expiry (null or absent: never). */
export interface GrantTerm {
  role: DeckGrant
  expiresAt?: string | Date | null
}

/** Whether a grant's expiry has passed: it stays listed and opens nothing. */
export function isExpired(grant: GrantTerm, now = new Date()): boolean {
  return grant.expiresAt != null && new Date(grant.expiresAt) <= now
}

/**
 * The date until which a sharer may give access to a deck. A global role has no
 * limit; a collaborator is limited by the editor grants they hold on the deck and
 * on its folder: no limit when one of them is permanent, the latest expiry
 * otherwise. Without a live editor grant the limit is `now`.
 */
export function sharingLimit(role: Role, own: (GrantTerm | null | undefined)[], now = new Date()): Date | null {
  if (isPrivileged(role))
    return null
  const ends = own
    .filter((grant): grant is GrantTerm => grant?.role === 'editor' && !isExpired(grant, now))
    .map(grant => grant.expiresAt == null ? null : new Date(grant.expiresAt))
  if (ends.includes(null))
    return null
  return ends.length ? new Date(Math.max(...ends.map(end => end!.getTime()))) : now
}

/**
 * Whether a sharer whose access runs until `limit` (null: no limit) may write the
 * grant `requested` (its expiry null: never). `current` is the grant before the
 * write, absent for a new grant. A collaborator neither gives nor extends access
 * past their own: the grant ends by `limit`, or, without raising its role, no
 * later than it already did.
 */
export function mayGrantUntil(limit: Date | null, requested: GrantTerm, current?: GrantTerm): boolean {
  const end = (term: GrantTerm) => term.expiresAt == null ? null : new Date(term.expiresAt)
  const notAfter = (a: Date | null, b: Date | null) => b === null || (a !== null && a <= b)
  if (notAfter(end(requested), limit))
    return true
  const raises = current?.role === 'viewer' && requested.role === 'editor'
  return current !== undefined && !raises && notAfter(end(requested), end(current))
}
