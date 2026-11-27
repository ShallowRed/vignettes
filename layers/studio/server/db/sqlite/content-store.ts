import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type { DeckContent } from '../ports.ts'
import { prepareDeckWrite, splitFrontmatter } from '@vignettes/core/deck'
import { and, eq, isNull } from 'drizzle-orm'
import { publicationAccess, readsPublishedText } from '../../../shared/presentations/publication-access.ts'
import { referencedImages } from '../../../shared/storage/media-refs.ts'
import { recordDeckMedia } from './media-index.ts'
import { decks, deckVersions } from './schema.ts'

type Db = BetterSQLite3Database<Record<string, unknown>>

/**
 * SQLite adapters for the content ports. `source` serves the deck's published
 * version; `writer.save` IS the publish act: one immutable version row, then the
 * deck row repointed, its title and theme derived from the frontmatter and its
 * access axes from `publicationAccess`.
 */
export function createDbContent(db: Db): DeckContent {
  return {
    async publishedVersion(slug) {
      const row = db.select({ id: decks.publishedVersionId }).from(decks).where(eq(decks.slug, slug)).get()
      return row?.id ?? null
    },

    async publishedAt(slug) {
      const row = db.select({ at: deckVersions.publishedAt })
        .from(decks)
        .innerJoin(deckVersions, eq(deckVersions.id, decks.publishedVersionId))
        .where(eq(decks.slug, slug))
        .get()
      return row?.at ?? null
    },

    source: {
      id: 'db',
      async load(slug) {
        const deck = db.select().from(decks).where(and(eq(decks.slug, slug), isNull(decks.deletedAt))).get()
        if (!deck?.publishedVersionId)
          return null
        const version = db.select().from(deckVersions).where(eq(deckVersions.id, deck.publishedVersionId)).get()
        return version ? { raw: version.raw } : null
      },
    },

    writer: {
      id: 'db',
      isWritable: () => true,
      async save(input) {
        const prepared = prepareDeckWrite(input)
        const meta = splitFrontmatter(prepared.raw).data as Record<string, unknown>
        const now = new Date()

        const current = db.select({
          status: decks.status,
          unlisted: decks.unlisted,
          accessPasswordHash: decks.accessPasswordHash,
          project: decks.project,
          managed: decks.managed,
          publishedVersionId: decks.publishedVersionId,
        }).from(decks).where(eq(decks.slug, prepared.slug)).get()
        const publishedRaw = readsPublishedText(current, input)
          ? db.select({ raw: deckVersions.raw }).from(deckVersions).where(eq(deckVersions.id, current.publishedVersionId)).get()?.raw
          : undefined
        const accessAxes = publicationAccess(current, prepared.raw, { accessFromText: input.accessFromText, publishedRaw })

        const derived = {
          title: (meta.title as string) || prepared.slug,
          theme: (meta.theme as string) ?? null,
          ...accessAxes,
          managed: true,
          updatedAt: now,
        }
        // Deck row first (FK anchor), version next, then repoint — atomic.
        db.transaction((tx) => {
          tx.insert(decks)
            .values({ slug: prepared.slug, createdAt: now, ...derived })
            .onConflictDoUpdate({ target: decks.slug, set: derived })
            .run()
          const version = tx.insert(deckVersions)
            .values({
              deckSlug: prepared.slug,
              raw: prepared.raw,
              publishedBy: input.actor ?? 'unknown',
              publishedAt: now,
            })
            .returning({ id: deckVersions.id })
            .get()!
          tx.update(decks).set({ publishedVersionId: version.id }).where(eq(decks.slug, prepared.slug)).run()
          recordDeckMedia(tx, prepared.slug, referencedImages(prepared.raw))
        })

        return { key: `db:${prepared.slug}`, bytes: new TextEncoder().encode(prepared.raw).length }
      },
    },
  }
}
