import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type { DraftSnapshotSummary, SnapshotStore } from '../ports.ts'
import { Buffer } from 'node:buffer'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { snapshotsToDrop } from '../snapshot-retention.ts'
import { deckDraftSnapshots } from './schema.ts'

type Db = BetterSQLite3Database<Record<string, unknown>>

/** SQLite adapter for the draft snapshots of a deck. */
export function createSnapshotStore(db: Db): SnapshotStore {
  function summary(row: typeof deckDraftSnapshots.$inferSelect): DraftSnapshotSummary {
    return { id: row.id, createdAt: row.createdAt.getTime(), authors: row.authors, label: row.label, bytes: Buffer.byteLength(row.raw) }
  }

  return {
    async latest(slug) {
      const row = db.select().from(deckDraftSnapshots).where(eq(deckDraftSnapshots.deckSlug, slug)).orderBy(desc(deckDraftSnapshots.id)).get()
      return row ? { ...summary(row), raw: row.raw } : null
    },

    async add(slug, input) {
      const now = input.at ?? new Date()
      return db.transaction((tx) => {
        const { id } = tx.insert(deckDraftSnapshots)
          .values({ deckSlug: slug, raw: input.raw, authors: input.authors, label: input.label ?? null, createdAt: now })
          .returning({ id: deckDraftSnapshots.id })
          .get()!
        const rows = tx.select({ id: deckDraftSnapshots.id, createdAt: deckDraftSnapshots.createdAt, label: deckDraftSnapshots.label })
          .from(deckDraftSnapshots)
          .where(eq(deckDraftSnapshots.deckSlug, slug))
          .all()
        const drop = snapshotsToDrop(rows.map(row => ({ ...row, createdAt: row.createdAt.getTime() })), now.getTime())
        if (drop.length)
          tx.delete(deckDraftSnapshots).where(inArray(deckDraftSnapshots.id, drop)).run()
        return id
      })
    },

    async list(slug) {
      return db.select().from(deckDraftSnapshots).where(eq(deckDraftSnapshots.deckSlug, slug)).orderBy(desc(deckDraftSnapshots.id)).all().map(summary)
    },

    async load(slug, id) {
      const row = db.select().from(deckDraftSnapshots).where(and(eq(deckDraftSnapshots.deckSlug, slug), eq(deckDraftSnapshots.id, id))).get()
      return row ? { ...summary(row), raw: row.raw } : null
    },
  }
}
