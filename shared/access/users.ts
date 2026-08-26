import type { Role } from './roles'

/**
 * `UserStore` port: identities and their runtime role. The database is the role's
 * source of truth; the env login map only seeds new users (see resolve-role).
 */

export interface UserProfile {
  id: number
  login: string
  name?: string | null
  avatarUrl?: string | null
}

export interface UserAccount extends UserProfile {
  role: Role
  lastLoginAt: Date
  /** Pre-provisioned by invitation, not logged in yet (identity unclaimed). */
  invited?: boolean
}

/**
 * External OAuth identity. `providerId` stays a string: Google subs are ~21
 * digits and would silently lose precision as a JS number.
 */
export interface OAuthIdentity {
  provider: 'github' | 'google'
  providerId: string
  login: string
  name?: string | null
  avatarUrl?: string | null
}

export interface UserStore {
  /**
   * Record a login for a provider identity. A new user gets `bootstrapRole` and
   * a minted internal id; an existing one keeps their stored role. Returns the
   * internal id — that is what sessions and grants reference.
   *
   * With `claimInvited` (set by the handler only when the provider vouches for
   * the email), a first login may claim a pre-provisioned invited account whose
   * login matches: the placeholder identity becomes the real one and every grant
   * already attached to the account applies.
   */
  upsertOAuthLogin: (identity: OAuthIdentity, bootstrapRole: Role, opts?: { claimInvited?: boolean }) => Promise<{ id: number, role: Role }>
  /**
   * Pre-provision a Google account by email so it can be granted access before
   * its first login. Idempotent: an existing account (invited or real) with this
   * login is returned untouched.
   */
  invite: (email: string) => Promise<UserAccount>
  /** Id-keyed variant for synthetic accounts (dev-login) whose internal id is fixed. */
  upsertOnLogin: (profile: UserProfile, bootstrapRole: Role) => Promise<Role>
  getRole: (id: number) => Promise<Role | null>
  list: () => Promise<UserAccount[]>
  setRole: (id: number, role: Role) => Promise<void>
}
