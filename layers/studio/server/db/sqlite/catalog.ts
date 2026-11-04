import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type { CatalogStore } from '../ports.ts'
import { count, eq, inArray } from 'drizzle-orm'
import { deckDrafts, deckPermissions, decks, deckVersions, projectPermissions } from './schema.ts'

type Db = BetterSQLite3Database<Record<string, unknown>>

/** SQLite refuses a statement with more than 999 bound variables. */
const ID_BATCH = 500

/** SQLite adapter for the reads of the catalog. */
export function createCatalogStore(db: Db): CatalogStore {
  return {
    async deckGrantCounts() {
      const rows = db.select({ slug: deckPermissions.deckSlug, n: count() }).from(deckPermissions).groupBy(deckPermissions.deckSlug).all()
      return new Map(rows.map(r => [r.slug, r.n]))
    },

    async projectGrantCounts() {
      const rows = db.select({ slug: projectPermissions.projectSlug, n: count() }).from(projectPermissions).groupBy(projectPermissions.projectSlug).all()
      return new Map(rows.map(r => [r.slug, r.n]))
    },

    async publishedDecks() {
      return db
        .select({ slug: decks.slug, versionId: deckVersions.id, updatedAt: decks.updatedAt, publishedAt: deckVersions.publishedAt, draftSavedAt: deckDrafts.updatedAt })
        .from(decks)
        .innerJoin(deckVersions, eq(deckVersions.id, decks.publishedVersionId))
        .leftJoin(deckDrafts, eq(deckDrafts.deckSlug, decks.slug))
        .all()
    },

    async versionTexts(ids) {
      const texts: { id: number, raw: string }[] = []
      for (let from = 0; from < ids.length; from += ID_BATCH) {
        texts.push(...db
          .select({ id: deckVersions.id, raw: deckVersions.raw })
          .from(deckVersions)
          .where(inArray(deckVersions.id, ids.slice(from, from + ID_BATCH)))
          .all())
      }
      return texts
    },
  }
}
