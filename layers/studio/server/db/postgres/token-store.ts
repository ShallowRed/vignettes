import type { PersonalToken, TokenStore } from '../ports.ts'
import type { PostgresDb } from './index.ts'
import { and, count, desc, eq, gt, isNotNull, isNull, lte, or } from 'drizzle-orm'
import { readRole, readTokenScope } from '../stored-values.ts'
import { personalTokens, users } from './schema.ts'

type TokenRow = typeof personalTokens.$inferSelect

function record({ tokenHash: _, ...row }: TokenRow): PersonalToken {
  return { ...row, scope: readTokenScope(row.scope) }
}

/** PostgreSQL adapter for the personal access tokens. */
export function createTokenStore(db: PostgresDb): TokenStore {
  const ofUser = (id: number, userId: number) => and(eq(personalTokens.id, id), eq(personalTokens.userId, userId))

  return {
    async create(userId, input, at) {
      const [row] = await db.insert(personalTokens)
        .values({ userId, ...input, createdAt: at })
        .returning()
      return record(row!)
    },

    async findByHash(tokenHash) {
      const [row] = await db.select({ token: personalTokens, login: users.login, role: users.role })
        .from(personalTokens)
        .innerJoin(users, eq(users.id, personalTokens.userId))
        .where(eq(personalTokens.tokenHash, tokenHash))
      return row ? { ...record(row.token), tokenHash: row.token.tokenHash, holder: { login: row.login, role: readRole(row.role) } } : null
    },

    async listForUser(userId) {
      return (await db.select().from(personalTokens).where(eq(personalTokens.userId, userId)).orderBy(desc(personalTokens.id))).map(record)
    },

    async revoke(id, userId, at) {
      const rows = await db.update(personalTokens).set({ revokedAt: at }).where(and(ofUser(id, userId), isNull(personalTokens.revokedAt))).returning({ id: personalTokens.id })
      return rows.length > 0
    },

    async revokeAllForUser(userId, at) {
      const rows = await db.update(personalTokens).set({ revokedAt: at }).where(and(eq(personalTokens.userId, userId), isNull(personalTokens.revokedAt))).returning({ id: personalTokens.id })
      return rows.length
    },

    async remove(id, userId, at) {
      const inactive = or(isNotNull(personalTokens.revokedAt), lte(personalTokens.expiresAt, at))
      const rows = await db.delete(personalTokens).where(and(ofUser(id, userId), inactive)).returning({ id: personalTokens.id })
      return rows.length > 0
    },

    async touch(id, at) {
      await db.update(personalTokens).set({ lastUsedAt: at }).where(eq(personalTokens.id, id))
    },

    async activeCounts(at) {
      const rows = await db.select({ userId: personalTokens.userId, n: count() })
        .from(personalTokens)
        .where(and(isNull(personalTokens.revokedAt), gt(personalTokens.expiresAt, at)))
        .groupBy(personalTokens.userId)
      return new Map(rows.map(row => [row.userId, row.n]))
    },
  }
}
