import type { Lifecycle } from '#shared/access'
import type { DeckMetaPatch, DeckMetaRecord, DeckMetaStore } from '../ports.ts'
import type { PostgresDb } from './index.ts'
import { and, eq, isNotNull, isNull } from 'drizzle-orm'
import { readStatus } from '../stored-values.ts'
import { deckAliases, deckDrafts, deckDraftSnapshots, deckMedia, deckPermissions, decks, deckVersions } from './schema.ts'

/**
 * Hard-delete one deck's rows (grants, redirect aliases, draft, media keys,
 * snapshots, versions, row) inside the caller's transaction. Shared by deck
 * purge and project purge so the cascade stays defined once.
 */
export async function purgeDeckRows(tx: PostgresDb, slug: string): Promise<void> {
  await tx.delete(deckPermissions).where(eq(deckPermissions.deckSlug, slug))
  await tx.delete(deckAliases).where(eq(deckAliases.deckSlug, slug))
  await tx.delete(deckDrafts).where(eq(deckDrafts.deckSlug, slug))
  await tx.delete(deckMedia).where(eq(deckMedia.deckSlug, slug))
  await tx.delete(deckDraftSnapshots).where(eq(deckDraftSnapshots.deckSlug, slug))
  await tx.update(decks).set({ publishedVersionId: null }).where(eq(decks.slug, slug))
  await tx.delete(deckVersions).where(eq(deckVersions.deckSlug, slug))
  await tx.delete(decks).where(eq(decks.slug, slug))
}

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

export function createDeckMeta(db: PostgresDb): DeckMetaStore {
  return {
    async get(slug) {
      const [row] = await db.select().from(decks).where(and(eq(decks.slug, slug), isNull(decks.deletedAt)))
      return row ? toMeta(row) : null
    },

    async existsIncludingTrashed(slug) {
      return (await db.select({ slug: decks.slug }).from(decks).where(eq(decks.slug, slug))).length > 0
    },

    async isTrashed(slug) {
      return (await db.select({ slug: decks.slug }).from(decks).where(and(eq(decks.slug, slug), isNotNull(decks.deletedAt)))).length > 0
    },

    async listManaged() {
      return (await db.select().from(decks).where(and(eq(decks.managed, true), isNull(decks.deletedAt))).orderBy(decks.createdAt, decks.slug)).map(toMeta)
    },

    async listTrashed() {
      return (await db.select().from(decks).where(isNotNull(decks.deletedAt)).orderBy(decks.createdAt, decks.slug)).map(toMeta)
    },

    async update(slug: string, patch: DeckMetaPatch) {
      const now = new Date()
      const set = { ...patch, managed: true, updatedAt: now }
      const [row] = await db.insert(decks)
        .values({ slug, title: patch.title ?? slug, createdAt: now, ...set })
        .onConflictDoUpdate({ target: decks.slug, set })
        .returning()
      return toMeta(row!)
    },

    async softDelete(slug) {
      const rows = await db.update(decks)
        .set({ deletedAt: new Date() })
        .where(and(eq(decks.slug, slug), isNull(decks.deletedAt)))
        .returning({ slug: decks.slug })
      return rows.length > 0
    },

    async restore(slug) {
      const rows = await db.update(decks)
        .set({ deletedAt: null })
        .where(and(eq(decks.slug, slug), isNotNull(decks.deletedAt)))
        .returning({ slug: decks.slug })
      return rows.length > 0
    },

    async purge(slug) {
      return db.transaction(async (tx) => {
        const [row] = await tx.select({ slug: decks.slug }).from(decks).where(eq(decks.slug, slug))
        if (!row)
          return false
        await purgeDeckRows(tx, slug)
        return true
      })
    },

    async projectOf(slug) {
      const [row] = await db.select({ project: decks.project }).from(decks).where(eq(decks.slug, slug))
      return row?.project ?? null
    },

    async projectsBySlug() {
      return new Map((await db.select({ slug: decks.slug, project: decks.project }).from(decks)).map(row => [row.slug, row.project]))
    },
  }
}
