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

export interface UserStore {
  /** Record a login. A new user gets `bootstrapRole`; an existing one keeps their stored role. */
  upsertOnLogin: (profile: UserProfile, bootstrapRole: Role) => Promise<Role>
  getRole: (id: number) => Promise<Role | null>
  list: () => Promise<UserAccount[]>
  setRole: (id: number, role: Role) => Promise<void>
}
