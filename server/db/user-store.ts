import type { Role, UserStore } from '#shared/access'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { RoleSchema } from '#shared/access'
import { and, asc, eq } from 'drizzle-orm'
import { users } from './schema'

type Db = BetterSQLite3Database<Record<string, unknown>>

/** A stored role that fails validation degrades to the least-privileged one. */
function readRole(value: string): Role {
  const parsed = RoleSchema.safeParse(value)
  return parsed.success ? parsed.data : 'viewer'
}

/** SQLite adapter for the `UserStore` port (factory over a drizzle handle). */
export function createUserStore(db: Db): UserStore {
  return {
    async upsertOAuthLogin(identity, bootstrapRole) {
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
      // No explicit id: SQLite mints the next rowid above every existing id,
      // so internal ids never collide with the historical GitHub-id rows.
      const row = db.insert(users)
        .values({
          provider: identity.provider,
          providerId: identity.providerId,
          login: identity.login,
          name: identity.name ?? null,
          avatarUrl: identity.avatarUrl ?? null,
          role: bootstrapRole,
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

    async getRole(id) {
      const row = db.select({ role: users.role }).from(users).where(eq(users.id, id)).get()
      return row ? readRole(row.role) : null
    },

    async list() {
      return db.select().from(users).orderBy(asc(users.login)).all().map(row => ({
        id: row.id,
        login: row.login,
        name: row.name,
        avatarUrl: row.avatarUrl,
        role: readRole(row.role),
        lastLoginAt: row.lastLoginAt,
      }))
    },

    async setRole(id, role) {
      db.update(users).set({ role }).where(eq(users.id, id)).run()
    },
  }
}
