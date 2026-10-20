import type { Lifecycle } from '#shared/access'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type { DeckMetaPatch, DeckMetaRecord, DeckMetaStore } from '../ports.ts'
import { and, eq, isNotNull, isNull } from 'drizzle-orm'
import { readStatus } from '../stored-values.ts'
import { deckAliases, deckDrafts, deckDraftSnapshots, deckMedia, deckPermissions, decks, deckVersions } from './schema.ts'

type Db = BetterSQLite3Database<Record<string, unknown>>
/** The transaction handle drizzle hands the `db.transaction` callback. */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

/**
 * Hard-delete one deck's rows (grants, redirect aliases, draft, media keys, snapshots, versions, row)
 * inside the caller's transaction. Shared by deck purge and project purge so the
 * cascade stays defined once.
 */
export function purgeDeckRows(tx: Tx, slug: string): void {
  tx.delete(deckPermissions).where(eq(deckPermissions.deckSlug, slug)).run()
  tx.delete(deckAliases).where(eq(deckAliases.deckSlug, slug)).run()
  tx.delete(deckDrafts).where(eq(deckDrafts.deckSlug, slug)).run()
  tx.delete(deckMedia).where(eq(deckMedia.deckSlug, slug)).run()
  tx.delete(deckDraftSnapshots).where(eq(deckDraftSnapshots.deckSlug, slug)).run()
  tx.update(decks).set({ publishedVersionId: null }).where(eq(decks.slug, slug)).run()
  tx.delete(deckVersions).where(eq(deckVersions.deckSlug, slug)).run()
  tx.delete(decks).where(eq(decks.slug, slug)).run()
}

export function createDeckMeta(db: Db): DeckMetaStore {
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
      family: row.family ?? undefined,
      variantLabel: row.variantLabel ?? undefined,
      supersededBy: row.supersededBy ?? undefined,
      managed: row.managed,
      published: row.publishedVersionId != null,
    }
  }

  return {
    async get(slug) {
      const row = db.select().from(decks).where(and(eq(decks.slug, slug), isNull(decks.deletedAt))).get()
      return row ? toMeta(row) : null
    },

    async existsIncludingTrashed(slug) {
      return !!db.select({ slug: decks.slug }).from(decks).where(eq(decks.slug, slug)).get()
    },

    async isTrashed(slug) {
      return !!db.select({ slug: decks.slug }).from(decks).where(and(eq(decks.slug, slug), isNotNull(decks.deletedAt))).get()
    },

    async listManaged() {
      return db.select().from(decks).where(and(eq(decks.managed, true), isNull(decks.deletedAt))).all().map(toMeta)
    },

    async listTrashed() {
      return db.select().from(decks).where(isNotNull(decks.deletedAt)).all().map(toMeta)
    },

    async update(slug: string, patch: DeckMetaPatch) {
      const now = new Date()
      const set = { ...patch, managed: true, updatedAt: now }
      const row = db.insert(decks)
        .values({ slug, title: patch.title ?? slug, createdAt: now, ...set })
        .onConflictDoUpdate({ target: decks.slug, set })
        .returning()
        .get()!
      return toMeta(row)
    },

    async softDelete(slug) {
      const res = db.update(decks)
        .set({ deletedAt: new Date() })
        .where(and(eq(decks.slug, slug), isNull(decks.deletedAt)))
        .run()
      return res.changes > 0
    },

    async restore(slug) {
      const res = db.update(decks)
        .set({ deletedAt: null })
        .where(and(eq(decks.slug, slug), isNotNull(decks.deletedAt)))
        .run()
      return res.changes > 0
    },

    async purge(slug) {
      const row = db.select({ slug: decks.slug }).from(decks).where(eq(decks.slug, slug)).get()
      if (!row)
        return false
      db.transaction(tx => purgeDeckRows(tx, slug))
      return true
    },

    async projectOf(slug) {
      return db.select({ project: decks.project }).from(decks).where(eq(decks.slug, slug)).get()?.project ?? null
    },

    async projectsBySlug() {
      return new Map(db.select({ slug: decks.slug, project: decks.project }).from(decks).all().map(row => [row.slug, row.project]))
    },
  }
}
