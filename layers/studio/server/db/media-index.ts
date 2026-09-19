import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { referencedMedia } from '#shared/storage/media-refs'
import { eq } from 'drizzle-orm'
import { deckMedia } from './schema'

type Db = BetterSQLite3Database<Record<string, unknown>>
/** The database or the transaction of a caller. */
type Writer = Pick<Db, 'insert'>

/**
 * Which decks reference an uploaded image. Rows are only added: a deck that once
 * referenced an image keeps opening it.
 */

export function recordDeckMedia(db: Writer, deckSlug: string, names: string[]): void {
  if (names.length === 0)
    return
  const now = new Date()
  db.insert(deckMedia)
    .values(names.map(mediaName => ({ mediaName, deckSlug, createdAt: now })))
    .onConflictDoNothing()
    .run()
}

export interface MediaIndex {
  record: (deckSlug: string, names: string[]) => Promise<void>
  recordFromMarkdown: (deckSlug: string, raw: string) => Promise<void>
  decksFor: (mediaName: string) => Promise<string[]>
}

export function createMediaIndex(db: Db): MediaIndex {
  return {
    async record(deckSlug, names) {
      recordDeckMedia(db, deckSlug, names)
    },

    async recordFromMarkdown(deckSlug, raw) {
      recordDeckMedia(db, deckSlug, referencedMedia(raw))
    },

    async decksFor(mediaName) {
      return db.select({ slug: deckMedia.deckSlug })
        .from(deckMedia)
        .where(eq(deckMedia.mediaName, mediaName))
        .all()
        .map(row => row.slug)
    },
  }
}
