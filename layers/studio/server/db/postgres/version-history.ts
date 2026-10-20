import type { VersionHistory } from '../ports.ts'
import type { PostgresDb } from './index.ts'
import { Buffer } from 'node:buffer'
import { and, desc, eq } from 'drizzle-orm'
import { decks, deckVersions } from './schema.ts'

/**
 * Read side of `deck_versions`: the publications of a deck, newest first, and
 * the markdown of one of them. `content-store.ts` writes the rows.
 */
export function createVersionHistory(db: PostgresDb): VersionHistory {
  async function currentId(slug: string): Promise<number | null> {
    const [row] = await db.select({ id: decks.publishedVersionId }).from(decks).where(eq(decks.slug, slug))
    return row?.id ?? null
  }

  return {
    async list(slug) {
      const current = await currentId(slug)
      const rows = await db.select({
        id: deckVersions.id,
        publishedAt: deckVersions.publishedAt,
        publishedBy: deckVersions.publishedBy,
        raw: deckVersions.raw,
      })
        .from(deckVersions)
        .where(eq(deckVersions.deckSlug, slug))
        .orderBy(desc(deckVersions.id))
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
      const [row] = await db.select().from(deckVersions).where(and(eq(deckVersions.deckSlug, slug), eq(deckVersions.id, id)))
      if (!row)
        return null
      return {
        kind: 'version',
        id: row.id,
        at: row.publishedAt.getTime(),
        publishedBy: row.publishedBy,
        bytes: Buffer.byteLength(row.raw),
        current: row.id === await currentId(slug),
        raw: row.raw,
      }
    },
  }
}
