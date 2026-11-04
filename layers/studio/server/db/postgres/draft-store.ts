import type { DraftStore } from '@vignettes/core/deck'
import type { PostgresDb } from './index.ts'
import { eq } from 'drizzle-orm'
import { deckDrafts, decks } from './schema.ts'

/**
 * PostgreSQL adapter for the `DraftStore` port. `create` upserts a minimal
 * deck row first (FK anchor, fail-closed defaults); the real title/status
 * arrive at publish time.
 */
export function createDraftStore(db: PostgresDb): DraftStore {
  return {
    isWritable: () => true,

    async load(slug) {
      const [row] = await db.select({ ydoc: deckDrafts.ydoc }).from(deckDrafts).where(eq(deckDrafts.deckSlug, slug))
      return row ? new Uint8Array(row.ydoc) : null
    },

    async stamp(slug) {
      const [row] = await db.select({ updatedAt: deckDrafts.updatedAt }).from(deckDrafts).where(eq(deckDrafts.deckSlug, slug))
      return row ? row.updatedAt.getTime() : null
    },

    async create(slug, ydoc) {
      const now = new Date()
      return db.transaction(async (tx) => {
        await tx.insert(decks)
          .values({ slug, title: slug, createdAt: now, updatedAt: now })
          .onConflictDoNothing()
        const written = await tx.insert(deckDrafts)
          .values({ deckSlug: slug, ydoc, updatedAt: now })
          .onConflictDoNothing()
          .returning({ slug: deckDrafts.deckSlug })
        return written.length === 1
      })
    },

    async update(slug, merge) {
      await db.transaction(async (tx) => {
        // The row stays locked until the write: two stores merge one after the other.
        const [row] = await tx.select({ ydoc: deckDrafts.ydoc }).from(deckDrafts).where(eq(deckDrafts.deckSlug, slug)).for('update')
        const ydoc = merge(row ? new Uint8Array(row.ydoc) : null)
        if (!row)
          throw new Error(`No draft of "${slug}" to update`)
        await tx.update(deckDrafts).set({ ydoc, updatedAt: new Date() }).where(eq(deckDrafts.deckSlug, slug))
      })
    },
  }
}
