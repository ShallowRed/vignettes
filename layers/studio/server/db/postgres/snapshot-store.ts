import type { DraftSnapshotSummary, SnapshotStore } from '../ports.ts'
import type { PostgresDb } from './index.ts'
import { Buffer } from 'node:buffer'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { snapshotsToDrop } from '../snapshot-retention.ts'
import { deckDraftSnapshots } from './schema.ts'

function summary(row: typeof deckDraftSnapshots.$inferSelect): DraftSnapshotSummary {
  return { id: row.id, createdAt: row.createdAt.getTime(), authors: row.authors, label: row.label, bytes: Buffer.byteLength(row.raw) }
}

/** PostgreSQL adapter for the draft snapshots of a deck. */
export function createSnapshotStore(db: PostgresDb): SnapshotStore {
  return {
    async latest(slug) {
      const [row] = await db.select().from(deckDraftSnapshots).where(eq(deckDraftSnapshots.deckSlug, slug)).orderBy(desc(deckDraftSnapshots.id)).limit(1)
      return row ? { ...summary(row), raw: row.raw } : null
    },

    async add(slug, input) {
      const now = input.at ?? new Date()
      return db.transaction(async (tx) => {
        const [inserted] = await tx.insert(deckDraftSnapshots)
          .values({ deckSlug: slug, raw: input.raw, authors: input.authors, label: input.label ?? null, createdAt: now })
          .returning({ id: deckDraftSnapshots.id })
        const rows = await tx.select({ id: deckDraftSnapshots.id, createdAt: deckDraftSnapshots.createdAt, label: deckDraftSnapshots.label })
          .from(deckDraftSnapshots)
          .where(eq(deckDraftSnapshots.deckSlug, slug))
        const drop = snapshotsToDrop(rows.map(row => ({ ...row, createdAt: row.createdAt.getTime() })), now.getTime())
        if (drop.length)
          await tx.delete(deckDraftSnapshots).where(inArray(deckDraftSnapshots.id, drop))
        return inserted!.id
      })
    },

    async list(slug) {
      return (await db.select().from(deckDraftSnapshots).where(eq(deckDraftSnapshots.deckSlug, slug)).orderBy(desc(deckDraftSnapshots.id))).map(summary)
    },

    async load(slug, id) {
      const [row] = await db.select().from(deckDraftSnapshots).where(and(eq(deckDraftSnapshots.deckSlug, slug), eq(deckDraftSnapshots.id, id)))
      return row ? { ...summary(row), raw: row.raw } : null
    },
  }
}
