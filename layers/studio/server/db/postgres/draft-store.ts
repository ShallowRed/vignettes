import type { DraftStore } from '@vignettes/core/deck'
import type { PostgresDb } from './index.ts'
import { eq } from 'drizzle-orm'
import { deckDrafts, decks } from './schema.ts'

/**
 * PostgreSQL adapter for the `DraftStore` port. Saving upserts a minimal deck
 * row first (FK anchor, fail-closed defaults); the real title/status arrive at
 * publish time.
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

    async save(slug, ydoc) {
      const now = new Date()
      await db.transaction(async (tx) => {
        await tx.insert(decks)
          .values({ slug, title: slug, createdAt: now, updatedAt: now })
          .onConflictDoNothing()
        await tx.insert(deckDrafts)
          .values({ deckSlug: slug, ydoc, updatedAt: now })
          .onConflictDoUpdate({ target: deckDrafts.deckSlug, set: { ydoc, updatedAt: now } })
      })
    },
  }
}
