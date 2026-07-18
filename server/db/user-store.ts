import type { Role, UserStore } from '#shared/access'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { RoleSchema } from '#shared/access'
import { asc, eq } from 'drizzle-orm'
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
    async upsertOnLogin(profile, bootstrapRole) {
      const now = new Date()
      const row = db.insert(users)
        .values({
          id: profile.id,
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
