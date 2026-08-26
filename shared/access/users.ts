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
   */
  upsertOAuthLogin: (identity: OAuthIdentity, bootstrapRole: Role) => Promise<{ id: number, role: Role }>
  /** Id-keyed variant for synthetic accounts (dev-login) whose internal id is fixed. */
  upsertOnLogin: (profile: UserProfile, bootstrapRole: Role) => Promise<Role>
  getRole: (id: number) => Promise<Role | null>
  list: () => Promise<UserAccount[]>
  setRole: (id: number, role: Role) => Promise<void>
}
