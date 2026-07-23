import type { Lifecycle, PublicationStatus } from '#shared/access'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { PublicationStatusSchema } from '#shared/access'
import { and, eq, isNotNull, isNull } from 'drizzle-orm'
import { deckAliases, deckDrafts, deckPermissions, decks, deckVersions } from './schema'

type Db = BetterSQLite3Database<Record<string, unknown>>
/** The transaction handle drizzle hands the `db.transaction` callback. */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

/**
 * Hard-delete one deck's rows (grants, redirect aliases, draft, versions, row)
 * inside the caller's transaction. Shared by deck purge and project purge so the
 * cascade stays defined once.
 */
export function purgeDeckRows(tx: Tx, slug: string): void {
  tx.delete(deckPermissions).where(eq(deckPermissions.deckSlug, slug)).run()
  tx.delete(deckAliases).where(eq(deckAliases.deckSlug, slug)).run()
  tx.delete(deckDrafts).where(eq(deckDrafts.deckSlug, slug)).run()
  tx.update(decks).set({ publishedVersionId: null }).where(eq(decks.slug, slug)).run()
  tx.delete(deckVersions).where(eq(deckVersions.deckSlug, slug)).run()
  tx.delete(decks).where(eq(decks.slug, slug)).run()
}

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
      const row = db.select().from(decks).where(and(eq(decks.slug, slug), isNull(decks.deletedAt))).get()
      return row ? toMeta(row) : null
    },

    /** True if the slug is taken by any row, trashed included — the create guard. */
    async existsIncludingTrashed(slug: string): Promise<boolean> {
      return !!db.select({ slug: decks.slug }).from(decks).where(eq(decks.slug, slug)).get()
    },

    /**
     * True when a row exists for this slug and it is in the trash. The write
     * guard: `get()` returns null both for a brand-new deck (editable) and a
     * trashed one (not), so edit paths need this to tell them apart.
     */
    async isTrashed(slug: string): Promise<boolean> {
      return !!db.select({ slug: decks.slug }).from(decks).where(and(eq(decks.slug, slug), isNotNull(decks.deletedAt))).get()
    },

    async listManaged(): Promise<DeckMetaRecord[]> {
      return db.select().from(decks).where(and(eq(decks.managed, true), isNull(decks.deletedAt))).all().map(toMeta)
    },

    /** Trashed decks (soft-deleted), newest first — the corbeille listing. */
    async listTrashed(): Promise<DeckMetaRecord[]> {
      return db.select().from(decks).where(isNotNull(decks.deletedAt)).all().map(toMeta)
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

    /** Move a deck to the trash (reversible). Returns false when nothing existed. */
    async softDelete(slug: string): Promise<boolean> {
      const res = db.update(decks)
        .set({ deletedAt: new Date() })
        .where(and(eq(decks.slug, slug), isNull(decks.deletedAt)))
        .run()
      return res.changes > 0
    },

    /** Bring a trashed deck back. Returns false when nothing was trashed. */
    async restore(slug: string): Promise<boolean> {
      const res = db.update(decks)
        .set({ deletedAt: null })
        .where(and(eq(decks.slug, slug), isNotNull(decks.deletedAt)))
        .run()
      return res.changes > 0
    },

    /**
     * Erase every database trace of a deck: grants, redirect aliases, draft,
     * versions, then the row itself. A file-backed deck reverts to its committed
     * markdown; an app-created deck is gone. Returns false when nothing existed.
     * This is permanent — the "empty the trash" primitive.
     */
    async purge(slug: string): Promise<boolean> {
      const row = db.select({ slug: decks.slug }).from(decks).where(eq(decks.slug, slug)).get()
      if (!row)
        return false
      db.transaction(tx => purgeDeckRows(tx, slug))
      return true
    },
  }
}
