import type { UserStore } from '#shared/access'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { and, asc, eq, sql } from 'drizzle-orm'
import { handleKey, invitedPlaceholder, isInvitedPlaceholder } from '../identities.ts'
import { readRole } from '../stored-values.ts'
import { deckPermissions, projectPermissions, users } from './schema.ts'

type Db = BetterSQLite3Database<Record<string, unknown>>

/** SQLite adapter for the `UserStore` port (factory over a drizzle handle). */
export function createUserStore(db: Db): UserStore {
  /** The account of this provider whose login names the same handle, if any. */
  function findAccountByHandle(provider: string, login: string) {
    const target = handleKey(provider, login)
    return db.select().from(users).where(eq(users.provider, provider)).all().find(row => handleKey(provider, row.login) === target)
  }

  return {
    async upsertOAuthLogin(identity, bootstrapRole, opts) {
      const now = new Date()
      const existing = db.select({ id: users.id, role: users.role }).from(users).where(and(eq(users.provider, identity.provider), eq(users.providerId, identity.providerId))).get()
      if (existing) {
        db.update(users)
          .set({
            login: identity.login,
            name: identity.name ?? null,
            avatarUrl: identity.avatarUrl ?? null,
            lastLoginAt: now,
          })
          .where(eq(users.id, existing.id))
          .run()
        return { id: existing.id, role: readRole(existing.role) }
      }
      // First login may claim an invited account: same provider, login matched,
      // and the caller vouched for the email (claimInvited). The placeholder
      // identity becomes the real one; role and grants carry over. Exact match
      // first, then the same-inbox fallback (gmail dot/plus spellings).
      if (opts?.claimInvited) {
        const candidate = db.select().from(users).where(and(eq(users.provider, identity.provider), eq(users.providerId, invitedPlaceholder(identity.login)))).get()
          ?? findAccountByHandle(identity.provider, identity.login)
        // Only an unclaimed placeholder may be taken over — never a real account.
        const stub = candidate && isInvitedPlaceholder(candidate.providerId) ? candidate : undefined
        if (stub) {
          db.update(users)
            .set({
              providerId: identity.providerId,
              // Google's canonical spelling replaces whatever the owner typed.
              login: identity.login,
              name: identity.name ?? null,
              avatarUrl: identity.avatarUrl ?? null,
              lastLoginAt: now,
            })
            .where(eq(users.id, stub.id))
            .run()
          return { id: stub.id, role: readRole(stub.role) }
        }
      }
      const firstAccount = opts?.firstAccountOwns && !db.select({ id: users.id }).from(users).limit(1).get()
      // No explicit id: AUTOINCREMENT mints one above every id ever given, the
      // historical GitHub ids and the ids of removed accounts included.
      const row = db.insert(users)
        .values({
          provider: identity.provider,
          providerId: identity.providerId,
          login: identity.login,
          name: identity.name ?? null,
          avatarUrl: identity.avatarUrl ?? null,
          role: firstAccount ? 'owner' : bootstrapRole,
          createdAt: now,
          lastLoginAt: now,
        })
        .returning({ id: users.id, role: users.role })
        .get()!
      return { id: row.id, role: readRole(row.role) }
    },

    async upsertOnLogin(profile, bootstrapRole) {
      const now = new Date()
      const row = db.insert(users)
        .values({
          id: profile.id,
          // Mirror the 0010 backfill so the (provider, provider_id) unique
          // index holds — two synthetic accounts must not share ('github', '').
          provider: 'github',
          providerId: String(profile.id),
          login: profile.login,
          name: profile.name ?? null,
          avatarUrl: profile.avatarUrl ?? null,
          role: bootstrapRole,
          createdAt: now,
          lastLoginAt: now,
        })
        .onConflictDoUpdate({
          target: users.id,
          set: {
            login: profile.login,
            name: profile.name ?? null,
            avatarUrl: profile.avatarUrl ?? null,
            lastLoginAt: now,
          },
        })
        .returning({ role: users.role })
        .get()!
      return readRole(row.role)
    },

    async invite({ provider, handle }) {
      const login = handle.trim().toLowerCase()
      const now = new Date()
      // Find-or-invite: an existing account (real or already invited) with this
      // login — or the same handle under another spelling — is returned
      // untouched; inviting twice must not reset anything or split one identity
      // across two accounts.
      const existing = db.select().from(users).where(eq(users.login, login)).get()
        ?? findAccountByHandle(provider, login)
      const row = existing ?? db.insert(users)
        .values({
          provider,
          providerId: invitedPlaceholder(login),
          login,
          role: 'viewer',
          createdAt: now,
          lastLoginAt: now,
        })
        .returning()
        .get()!
      return {
        id: row.id,
        login: row.login,
        name: row.name,
        avatarUrl: row.avatarUrl,
        role: readRole(row.role),
        lastLoginAt: row.lastLoginAt,
        invited: isInvitedPlaceholder(row.providerId),
      }
    },

    async getAccount(id) {
      const row = db.select({ login: users.login, role: users.role, sessionVersion: users.sessionVersion }).from(users).where(eq(users.id, id)).get()
      return row ? { ...row, role: readRole(row.role) } : null
    },

    async endSessions(id) {
      db.update(users).set({ sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, id)).run()
    },

    async list() {
      return db.select().from(users).orderBy(asc(users.login)).all().map(row => ({
        id: row.id,
        login: row.login,
        name: row.name,
        avatarUrl: row.avatarUrl,
        role: readRole(row.role),
        lastLoginAt: row.lastLoginAt,
        invited: isInvitedPlaceholder(row.providerId),
      }))
    },

    async setRole(id, role) {
      db.update(users).set({ role, sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, id)).run()
    },

    async remove(id) {
      const row = db.select({ id: users.id }).from(users).where(eq(users.id, id)).get()
      if (!row)
        return false
      db.transaction((tx) => {
        tx.delete(deckPermissions).where(eq(deckPermissions.userId, id)).run()
        tx.delete(projectPermissions).where(eq(projectPermissions.userId, id)).run()
        tx.delete(users).where(eq(users.id, id)).run()
      })
      return true
    },
  }
}
