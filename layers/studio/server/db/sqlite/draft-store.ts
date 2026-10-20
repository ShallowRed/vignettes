import type { DraftStore } from '@vignettes/core/deck'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { Buffer } from 'node:buffer'
import { eq } from 'drizzle-orm'
import { deckDrafts, decks } from './schema.ts'

type Db = BetterSQLite3Database<Record<string, unknown>>

/**
 * SQLite adapter for the `DraftStore` port. Factory over a drizzle handle so
 * tests run it against an in-memory database. Saving upserts a minimal deck row
 * first (FK anchor, fail-closed defaults); the real title/status arrive at
 * publish time.
 */
export function createDraftStore(db: Db): DraftStore {
  return {
    isWritable: () => true,

    async load(slug) {
      const row = db.select().from(deckDrafts).where(eq(deckDrafts.deckSlug, slug)).get()
      return row ? new Uint8Array(row.ydoc) : null
    },

    async stamp(slug) {
      const row = db.select({ updatedAt: deckDrafts.updatedAt }).from(deckDrafts).where(eq(deckDrafts.deckSlug, slug)).get()
      return row ? row.updatedAt.getTime() : null
    },

    async save(slug, ydoc) {
      const now = new Date()
      db.transaction((tx) => {
        tx.insert(decks)
          .values({ slug, title: slug, createdAt: now, updatedAt: now })
          .onConflictDoNothing()
          .run()
        tx.insert(deckDrafts)
          .values({ deckSlug: slug, ydoc: Buffer.from(ydoc), updatedAt: now })
          .onConflictDoUpdate({ target: deckDrafts.deckSlug, set: { ydoc: Buffer.from(ydoc), updatedAt: now } })
          .run()
      })
    },
  }
}
