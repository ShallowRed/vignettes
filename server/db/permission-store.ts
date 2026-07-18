import type { DeckGrant } from '#shared/access'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { DeckGrantSchema } from '#shared/access'
import { and, eq } from 'drizzle-orm'
import { deckPermissions, decks, users } from './schema'

type Db = BetterSQLite3Database<Record<string, unknown>>

export interface DeckGrantRecord {
  userId: number
  login: string
  role: DeckGrant
  grantedBy: string
  createdAt: Date
}

/** An invalid stored grant degrades to view-only. */
function readGrant(value: string): DeckGrant {
  const parsed = DeckGrantSchema.safeParse(value)
  return parsed.success ? parsed.data : 'viewer'
}

/** SQLite adapter for per-deck permission grants. */
export function createPermissionStore(db: Db) {
  return {
    async get(slug: string, userId: number): Promise<DeckGrant | null> {
      const row = db.select().from(deckPermissions).where(and(eq(deckPermissions.deckSlug, slug), eq(deckPermissions.userId, userId))).get()
      return row ? readGrant(row.role) : null
    },

    async listForDeck(slug: string): Promise<DeckGrantRecord[]> {
      return db.select({
        userId: deckPermissions.userId,
        login: users.login,
        role: deckPermissions.role,
        grantedBy: deckPermissions.grantedBy,
        createdAt: deckPermissions.createdAt,
      })
        .from(deckPermissions)
        .innerJoin(users, eq(users.id, deckPermissions.userId))
        .where(eq(deckPermissions.deckSlug, slug))
        .all()
        .map(r => ({ ...r, role: readGrant(r.role) }))
    },

    /** slug → grant, for catalog visibility in one lookup. */
    async listForUser(userId: number): Promise<Map<string, DeckGrant>> {
      const rows = db.select().from(deckPermissions).where(eq(deckPermissions.userId, userId)).all()
      return new Map(rows.map(r => [r.deckSlug, readGrant(r.role)]))
    },

    async set(slug: string, userId: number, role: DeckGrant, grantedBy: string): Promise<void> {
      const now = new Date()
      // FK anchor for decks not yet in the database (file-only decks are grantable too).
      db.insert(decks)
        .values({ slug, title: slug, createdAt: now, updatedAt: now })
        .onConflictDoNothing()
        .run()
      db.insert(deckPermissions)
        .values({ deckSlug: slug, userId, role, grantedBy, createdAt: now })
        .onConflictDoUpdate({
          target: [deckPermissions.deckSlug, deckPermissions.userId],
          set: { role, grantedBy, createdAt: now },
        })
        .run()
    },

    async remove(slug: string, userId: number): Promise<void> {
      db.delete(deckPermissions)
        .where(and(eq(deckPermissions.deckSlug, slug), eq(deckPermissions.userId, userId)))
        .run()
    },
  }
}
