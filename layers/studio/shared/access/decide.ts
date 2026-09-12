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

/** Anonymous → 401 (log in); authenticated-but-unprivileged → 403 (you can't). */
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
