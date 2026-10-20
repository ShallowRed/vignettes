import type { MediaIndex } from '../ports.ts'
import type { PostgresDb } from './index.ts'
import { eq } from 'drizzle-orm'
import { referencedImages } from '../../../shared/storage/media-refs.ts'
import { deckMedia } from './schema.ts'

/**
 * Records that this deck references these images, in the caller's transaction
 * when it passes one. `origin` marks the deck the image was uploaded to, and
 * {@link MediaIndex.decksFor} answers with that deck alone when there is one.
 */
export async function recordDeckMedia(db: PostgresDb, deckSlug: string, names: string[], { origin = false }: { origin?: boolean } = {}): Promise<void> {
  if (names.length === 0)
    return
  const now = new Date()
  // PostgreSQL refuses to update one row twice in a statement.
  const insert = db.insert(deckMedia)
    .values([...new Set(names)].map(mediaName => ({ mediaName, deckSlug, createdAt: now, origin })))
  // An upload can follow the draft that already cites the image, so recording it
  // raises the flag on the row the reference left behind.
  await (origin
    ? insert.onConflictDoUpdate({ target: [deckMedia.mediaName, deckMedia.deckSlug], set: { origin: true } })
    : insert.onConflictDoNothing())
}

export function createMediaIndex(db: PostgresDb): MediaIndex {
  return {
    async record(deckSlug, names) {
      await recordDeckMedia(db, deckSlug, names, { origin: true })
    },

    async recordFromMarkdown(deckSlug, raw) {
      await recordDeckMedia(db, deckSlug, referencedImages(raw))
    },

    async decksFor(mediaName) {
      const rows = await db.select({ slug: deckMedia.deckSlug, origin: deckMedia.origin })
        .from(deckMedia)
        .where(eq(deckMedia.mediaName, mediaName))
      const origins = rows.filter(row => row.origin)
      // An image stored before the upload was recorded has no origin: the decks
      // citing it are all it has.
      return (origins.length > 0 ? origins : rows).map(row => row.slug)
    },
  }
}
