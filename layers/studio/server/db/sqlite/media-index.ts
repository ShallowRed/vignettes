import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type { MediaIndex } from '../ports.ts'
import { eq } from 'drizzle-orm'
import { referencedImages } from '../../../shared/storage/media-refs.ts'
import { deckMedia } from './schema.ts'

type Db = BetterSQLite3Database<Record<string, unknown>>
/** The database or the transaction of a caller. */
type Writer = Pick<Db, 'insert'>

/**
 * Records that this deck references these images. `origin` marks the deck the
 * image was uploaded to, and {@link MediaIndex.decksFor} answers with that deck
 * alone when there is one.
 */
export function recordDeckMedia(db: Writer, deckSlug: string, names: string[], { origin = false }: { origin?: boolean } = {}): void {
  if (names.length === 0)
    return
  const now = new Date()
  const insert = db.insert(deckMedia)
    .values(names.map(mediaName => ({ mediaName, deckSlug, createdAt: now, origin })))
  // An upload can follow the draft that already cites the image, so recording it
  // raises the flag on the row the reference left behind.
  const statement = origin
    ? insert.onConflictDoUpdate({ target: [deckMedia.mediaName, deckMedia.deckSlug], set: { origin: true } })
    : insert.onConflictDoNothing()
  statement.run()
}

export function createMediaIndex(db: Db): MediaIndex {
  return {
    async record(deckSlug, names) {
      recordDeckMedia(db, deckSlug, names, { origin: true })
    },

    async recordFromMarkdown(deckSlug, raw) {
      recordDeckMedia(db, deckSlug, referencedImages(raw))
    },

    async decksFor(mediaName) {
      const rows = db.select({ slug: deckMedia.deckSlug, origin: deckMedia.origin })
        .from(deckMedia)
        .where(eq(deckMedia.mediaName, mediaName))
        .all()
      const origins = rows.filter(row => row.origin)
      // An image stored before the upload was recorded has no origin: the decks
      // citing it are all it has.
      return (origins.length > 0 ? origins : rows).map(row => row.slug)
    },
  }
}
