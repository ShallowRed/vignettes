import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type { PersonalToken, TokenStore } from '../ports.ts'
import { and, count, desc, eq, gt, isNotNull, isNull, lte, or } from 'drizzle-orm'
import { readRole, readTokenScope } from '../stored-values.ts'
import { personalTokens, users } from './schema.ts'

type Db = BetterSQLite3Database<Record<string, unknown>>
type TokenRow = typeof personalTokens.$inferSelect

function record({ tokenHash: _, ...row }: TokenRow): PersonalToken {
  return { ...row, scope: readTokenScope(row.scope) }
}

/** SQLite adapter for the personal access tokens. */
export function createTokenStore(db: Db): TokenStore {
  const ofUser = (id: number, userId: number) => and(eq(personalTokens.id, id), eq(personalTokens.userId, userId))

  return {
    async create(userId, input, at) {
      const row = db.insert(personalTokens)
        .values({ userId, ...input, createdAt: at })
        .returning()
        .get()!
      return record(row)
    },

    async findByHash(tokenHash) {
      const row = db.select({ token: personalTokens, login: users.login, role: users.role })
        .from(personalTokens)
        .innerJoin(users, eq(users.id, personalTokens.userId))
        .where(eq(personalTokens.tokenHash, tokenHash))
        .get()
      return row ? { ...record(row.token), tokenHash: row.token.tokenHash, holder: { login: row.login, role: readRole(row.role) } } : null
    },

    async listForUser(userId) {
      return db.select().from(personalTokens).where(eq(personalTokens.userId, userId)).orderBy(desc(personalTokens.id)).all().map(record)
    },

    async revoke(id, userId, at) {
      const result = db.update(personalTokens).set({ revokedAt: at }).where(and(ofUser(id, userId), isNull(personalTokens.revokedAt))).run()
      return result.changes > 0
    },

    async revokeAllForUser(userId, at) {
      const result = db.update(personalTokens).set({ revokedAt: at }).where(and(eq(personalTokens.userId, userId), isNull(personalTokens.revokedAt))).run()
      return result.changes
    },

    async remove(id, userId, at) {
      const inactive = or(isNotNull(personalTokens.revokedAt), lte(personalTokens.expiresAt, at))
      const result = db.delete(personalTokens).where(and(ofUser(id, userId), inactive)).run()
      return result.changes > 0
    },

    async touch(id, at) {
      db.update(personalTokens).set({ lastUsedAt: at }).where(eq(personalTokens.id, id)).run()
    },

    async activeCounts(at) {
      const rows = db.select({ userId: personalTokens.userId, n: count() })
        .from(personalTokens)
        .where(and(isNull(personalTokens.revokedAt), gt(personalTokens.expiresAt, at)))
        .groupBy(personalTokens.userId)
        .all()
      return new Map(rows.map(row => [row.userId, row.n]))
    },
  }
}
