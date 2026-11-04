import type { DraftStore } from '@vignettes/core/deck'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { Buffer } from 'node:buffer'
import { eq } from 'drizzle-orm'
import { deckDrafts, decks } from './schema.ts'

type Db = BetterSQLite3Database<Record<string, unknown>>

/**
 * SQLite adapter for the `DraftStore` port. Factory over a drizzle handle so
 * tests run it against an in-memory database. `create` upserts a minimal deck
 * row first (FK anchor, fail-closed defaults); the real title/status arrive at
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

    async create(slug, ydoc) {
      const now = new Date()
      return db.transaction((tx) => {
        tx.insert(decks)
          .values({ slug, title: slug, createdAt: now, updatedAt: now })
          .onConflictDoNothing()
          .run()
        return tx.insert(deckDrafts)
          .values({ deckSlug: slug, ydoc: Buffer.from(ydoc), updatedAt: now })
          .onConflictDoNothing()
          .run()
          .changes === 1
      })
    },

    async update(slug, merge) {
      db.transaction((tx) => {
        const row = tx.select({ ydoc: deckDrafts.ydoc }).from(deckDrafts).where(eq(deckDrafts.deckSlug, slug)).get()
        const ydoc = merge(row ? new Uint8Array(row.ydoc) : null)
        if (!row)
          throw new Error(`No draft of "${slug}" to update`)
        tx.update(deckDrafts).set({ ydoc: Buffer.from(ydoc), updatedAt: new Date() }).where(eq(deckDrafts.deckSlug, slug)).run()
      })
    },
  }
}
