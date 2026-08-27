import type { ContentSource, ContentWriter } from '#shared/deck'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { prepareDeckWrite, resolveDeckStatus, splitFrontmatter } from '#shared/deck'
import { and, eq, isNull } from 'drizzle-orm'
import { decks, deckVersions } from './schema'

type Db = BetterSQLite3Database<Record<string, unknown>>

/**
 * SQLite adapters for the content ports. `source` serves the deck's published
 * version; `writer.save` IS the publish act: one immutable version row, then the
 * deck row repointed and its catalog/access axes re-derived from the frontmatter
 * (single derivation chain — no second truth to drift).
 */
export function createDbContent(db: Db): { source: ContentSource, writer: ContentWriter } {
  return {
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

        // A managed row is the access truth (admin edits shadow frontmatter), so
        // republishing must not re-derive the ACCESS axes: a stale
        // `status: public` in the source would silently reopen a deck an admin
        // closed (that incident happened). Access axes follow the frontmatter
        // only until the first publish marks the row managed; catalog axes
        // (title, theme, project) stay content-driven on every publish.
        const current = db.select({
          status: decks.status,
          unlisted: decks.unlisted,
          accessPasswordHash: decks.accessPasswordHash,
          managed: decks.managed,
        }).from(decks).where(eq(decks.slug, prepared.slug)).get()

        const accessAxes = current?.managed
          ? { status: current.status, unlisted: current.unlisted, accessPasswordHash: current.accessPasswordHash }
          : {
              status: resolveDeckStatus(prepared.raw),
              unlisted: Boolean(meta.unlisted),
              accessPasswordHash: (meta.accessPassword as string) ?? null,
            }

        const derived = {
          title: (meta.title as string) || prepared.slug,
          theme: (meta.theme as string) ?? null,
          project: (meta.project as string) ?? null,
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
        })

        return { key: `db:${prepared.slug}`, bytes: new TextEncoder().encode(prepared.raw).length }
      },
    },
  }
}
