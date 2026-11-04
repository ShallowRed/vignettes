import type { CatalogStore } from '../ports.ts'
import type { PostgresDb } from './index.ts'
import { count, eq, inArray } from 'drizzle-orm'
import { deckDrafts, deckPermissions, decks, deckVersions, projectPermissions } from './schema.ts'

/** PostgreSQL adapter for the reads of the catalog. */
export function createCatalogStore(db: PostgresDb): CatalogStore {
  return {
    async deckGrantCounts() {
      const rows = await db.select({ slug: deckPermissions.deckSlug, n: count() }).from(deckPermissions).groupBy(deckPermissions.deckSlug)
      return new Map(rows.map(r => [r.slug, r.n]))
    },

    async projectGrantCounts() {
      const rows = await db.select({ slug: projectPermissions.projectSlug, n: count() }).from(projectPermissions).groupBy(projectPermissions.projectSlug)
      return new Map(rows.map(r => [r.slug, r.n]))
    },

    async publishedDecks() {
      return db
        .select({ slug: decks.slug, versionId: deckVersions.id, updatedAt: decks.updatedAt, publishedAt: deckVersions.publishedAt, draftSavedAt: deckDrafts.updatedAt })
        .from(decks)
        .innerJoin(deckVersions, eq(deckVersions.id, decks.publishedVersionId))
        .leftJoin(deckDrafts, eq(deckDrafts.deckSlug, decks.slug))
    },

    async versionTexts(ids) {
      if (ids.length === 0)
        return []
      return db.select({ id: deckVersions.id, raw: deckVersions.raw }).from(deckVersions).where(inArray(deckVersions.id, ids))
    },
  }
}
