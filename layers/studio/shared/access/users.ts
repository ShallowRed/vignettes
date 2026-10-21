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
   * the handle: a verified email, or the provider-issued username), a first login
   * may claim a pre-provisioned invited account whose login matches: the
   * placeholder identity becomes the real one and every grant already attached
   * to the account applies.
   *
   * With `firstAccountOwns` (set when the role map names no owner), the account
   * created in an empty table gets the owner role.
   */
  upsertOAuthLogin: (identity: OAuthIdentity, bootstrapRole: Role, opts?: { claimInvited?: boolean, firstAccountOwns?: boolean }) => Promise<{ id: number, role: Role }>
  /**
   * Pre-provision an account by its provider handle (Google email or GitHub
   * username) so it can be granted access before its first login. Idempotent:
   * an existing account (invited or real) for this handle is returned untouched.
   */
  invite: (identity: { provider: 'github' | 'google', handle: string }) => Promise<UserAccount>
  /** Id-keyed variant for synthetic accounts (dev-login) whose internal id is fixed. */
  upsertOnLogin: (profile: UserProfile, bootstrapRole: Role) => Promise<Role>
  /** The login and the role of an account, for checking a session against its row. */
  getAccount: (id: number) => Promise<Pick<UserAccount, 'login' | 'role'> | null>
  list: () => Promise<UserAccount[]>
  setRole: (id: number, role: Role) => Promise<void>
  /**
   * Delete an account and every grant it holds (one transaction). Permanent —
   * the next login with the same identity starts a fresh account with no access.
   * Returns false when the id is unknown.
   */
  remove: (id: number) => Promise<boolean>
}
