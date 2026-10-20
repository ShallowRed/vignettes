import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type { VersionHistory } from '../ports.ts'
import { Buffer } from 'node:buffer'
import { and, desc, eq } from 'drizzle-orm'
import { decks, deckVersions } from './schema.ts'

type Db = BetterSQLite3Database<Record<string, unknown>>

/**
 * Read side of `deck_versions`: the publications of a deck, newest first, and
 * the markdown of one of them. `content-store.ts` writes the rows.
 */
export function createVersionHistory(db: Db): VersionHistory {
  function currentId(slug: string): number | null {
    return db.select({ id: decks.publishedVersionId }).from(decks).where(eq(decks.slug, slug)).get()?.id ?? null
  }

  return {
    async list(slug) {
      const current = currentId(slug)
      const rows = db.select({
        id: deckVersions.id,
        publishedAt: deckVersions.publishedAt,
        publishedBy: deckVersions.publishedBy,
        raw: deckVersions.raw,
      })
        .from(deckVersions)
        .where(eq(deckVersions.deckSlug, slug))
        .orderBy(desc(deckVersions.id))
        .all()
      return rows.map(row => ({
        kind: 'version' as const,
        id: row.id,
        at: row.publishedAt.getTime(),
        publishedBy: row.publishedBy,
        bytes: Buffer.byteLength(row.raw),
        current: row.id === current,
      }))
    },

    async load(slug, id) {
      const row = db.select().from(deckVersions).where(and(eq(deckVersions.deckSlug, slug), eq(deckVersions.id, id))).get()
      if (!row)
        return null
      return {
        kind: 'version',
        id: row.id,
        at: row.publishedAt.getTime(),
        publishedBy: row.publishedBy,
        bytes: Buffer.byteLength(row.raw),
        current: row.id === currentId(slug),
        raw: row.raw,
      }
    },
  }
}
