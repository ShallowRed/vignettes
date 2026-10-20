import type { DeckGrant } from '#shared/access'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type { DeckGrantStore, GrantRecord } from '../ports.ts'
import { and, eq, gt, isNull, or } from 'drizzle-orm'
import { isInvitedPlaceholder } from '../identities.ts'
import { readGrant } from '../stored-values.ts'
import { deckPermissions, decks, users } from './schema.ts'

type Db = BetterSQLite3Database<Record<string, unknown>>

/** An expired grant must not resolve; it stays listed so the owner can extend or drop it. */
const notExpired = (col: typeof deckPermissions.expiresAt) => or(isNull(col), gt(col, new Date()))

/** SQLite adapter for per-deck permission grants. */
export function createPermissionStore(db: Db): DeckGrantStore {
  return {
    async get(slug: string, userId: number): Promise<DeckGrant | null> {
      const row = db.select().from(deckPermissions).where(and(eq(deckPermissions.deckSlug, slug), eq(deckPermissions.userId, userId), notExpired(deckPermissions.expiresAt))).get()
      return row ? readGrant(row.role) : null
    },

    async listForDeck(slug: string): Promise<GrantRecord[]> {
      return db.select({
        userId: deckPermissions.userId,
        login: users.login,
        role: deckPermissions.role,
        grantedBy: deckPermissions.grantedBy,
        createdAt: deckPermissions.createdAt,
        expiresAt: deckPermissions.expiresAt,
        providerId: users.providerId,
      })
        .from(deckPermissions)
        .innerJoin(users, eq(users.id, deckPermissions.userId))
        .where(eq(deckPermissions.deckSlug, slug))
        .all()
        .map(({ providerId, ...r }) => ({ ...r, role: readGrant(r.role), invited: isInvitedPlaceholder(providerId) }))
    },

    /** slug → grant, for catalog visibility in one lookup. */
    async listForUser(userId: number): Promise<Map<string, DeckGrant>> {
      const rows = db.select().from(deckPermissions).where(and(eq(deckPermissions.userId, userId), notExpired(deckPermissions.expiresAt))).all()
      return new Map(rows.map(r => [r.deckSlug, readGrant(r.role)]))
    },

    async set(slug: string, userId: number, role: DeckGrant, grantedBy: string, expiresAt: Date | null = null): Promise<void> {
      const now = new Date()
      db.transaction((tx) => {
        // FK anchor for decks not yet in the database (file-only decks are grantable too).
        tx.insert(decks)
          .values({ slug, title: slug, createdAt: now, updatedAt: now })
          .onConflictDoNothing()
          .run()
        tx.insert(deckPermissions)
          .values({ deckSlug: slug, userId, role, grantedBy, createdAt: now, expiresAt })
          .onConflictDoUpdate({
            target: [deckPermissions.deckSlug, deckPermissions.userId],
            set: { role, grantedBy, createdAt: now, expiresAt },
          })
          .run()
      })
    },

    async remove(slug: string, userId: number): Promise<void> {
      db.delete(deckPermissions)
        .where(and(eq(deckPermissions.deckSlug, slug), eq(deckPermissions.userId, userId)))
        .run()
    },
  }
}
