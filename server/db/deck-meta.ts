import type { Lifecycle, PublicationStatus } from '#shared/access'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { PublicationStatusSchema } from '#shared/access'
import { eq } from 'drizzle-orm'
import { decks } from './schema'

type Db = BetterSQLite3Database<Record<string, unknown>>

/**
 * Deck catalog/access metadata read from the database — the truth for `managed`
 * rows (published or admin-edited). Draft-only anchor rows are reported
 * unmanaged so file frontmatter keeps authority over them.
 */
export interface DeckMetaRecord {
  slug: string
  title: string
  status: PublicationStatus
  lifecycle: Lifecycle
  theme?: string
  project?: string
  alias?: string
  frozenBundle?: string
  accessPasswordHash?: string
  unlisted: boolean
  managed: boolean
  published: boolean
}

/** An invalid stored status fails closed. */
function readStatus(value: string): PublicationStatus {
  const parsed = PublicationStatusSchema.safeParse(value)
  return parsed.success ? parsed.data : 'private'
}

export function createDeckMeta(db: Db) {
  function toMeta(row: typeof decks.$inferSelect): DeckMetaRecord {
    return {
      slug: row.slug,
      title: row.title,
      status: readStatus(row.status),
      lifecycle: row.lifecycle as Lifecycle,
      theme: row.theme ?? undefined,
      project: row.project ?? undefined,
      alias: row.alias ?? undefined,
      frozenBundle: row.frozenBundle ?? undefined,
      accessPasswordHash: row.accessPasswordHash ?? undefined,
      unlisted: row.unlisted,
      managed: row.managed,
      published: row.publishedVersionId != null,
    }
  }

  return {
    async get(slug: string): Promise<DeckMetaRecord | null> {
      const row = db.select().from(decks).where(eq(decks.slug, slug)).get()
      return row ? toMeta(row) : null
    },

    async listManaged(): Promise<DeckMetaRecord[]> {
      return db.select().from(decks).where(eq(decks.managed, true)).all().map(toMeta)
    },

    /**
     * Admin metadata edit — the second way a deck becomes `managed` (its row
     * turns into the metadata truth, shadowing file frontmatter).
     */
    async update(slug: string, patch: Partial<Pick<DeckMetaRecord, 'title' | 'status' | 'lifecycle' | 'project' | 'theme' | 'alias' | 'frozenBundle' | 'unlisted'>>): Promise<DeckMetaRecord> {
      const now = new Date()
      const set = { ...patch, managed: true, updatedAt: now }
      const row = db.insert(decks)
        .values({ slug, title: patch.title ?? slug, createdAt: now, ...set })
        .onConflictDoUpdate({ target: decks.slug, set })
        .returning()
        .get()!
      return toMeta(row)
    },
  }
}
