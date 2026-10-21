import type { ContentRewrites, StoredContent } from '../ports.ts'
import type { PostgresDb } from './index.ts'
import { eq } from 'drizzle-orm'
import { recordDeckMedia } from './media-index.ts'
import { dataMigrations, deckAliases, deckDrafts, deckDraftSnapshots, decks, deckVersions } from './schema.ts'

/**
 * The stored content, its rows locked until the transaction of the caller ends:
 * a draft saved during a rewrite waits for it, then writes its own text.
 */
async function readContent(db: PostgresDb): Promise<StoredContent> {
  return {
    decks: await db.select({ slug: decks.slug, theme: decks.theme, alias: decks.alias, frozenBundle: decks.frozenBundle }).from(decks).orderBy(decks.slug).for('update'),
    versions: await db.select({ id: deckVersions.id, slug: deckVersions.deckSlug, raw: deckVersions.raw }).from(deckVersions).orderBy(deckVersions.id).for('update'),
    snapshots: await db.select({ id: deckDraftSnapshots.id, slug: deckDraftSnapshots.deckSlug, raw: deckDraftSnapshots.raw }).from(deckDraftSnapshots).orderBy(deckDraftSnapshots.id).for('update'),
    drafts: await db.select({ slug: deckDrafts.deckSlug, ydoc: deckDrafts.ydoc }).from(deckDrafts).orderBy(deckDrafts.deckSlug).for('update'),
  }
}

/** PostgreSQL adapter for the rewrites of the stored content. */
export function createContentRewrites(db: PostgresDb): ContentRewrites {
  return {
    async appliedMigrations() {
      return new Set((await db.select({ name: dataMigrations.name }).from(dataMigrations)).map(row => row.name))
    },

    read: () => readContent(db),

    async rewrite(change, { migration, at } = {}) {
      return db.transaction(async (tx) => {
        const changes = change(await readContent(tx))
        const stamp = at ? { updatedAt: at } : {}
        for (const { slug, theme } of changes.themes ?? [])
          await tx.update(decks).set({ theme, ...stamp }).where(eq(decks.slug, slug))
        for (const { slug, alias, frozenBundle } of changes.directory ?? [])
          await tx.update(decks).set({ alias, frozenBundle, ...stamp }).where(eq(decks.slug, slug))
        for (const { alias, slug } of changes.aliases ?? [])
          await tx.insert(deckAliases).values({ alias, deckSlug: slug }).onConflictDoNothing()
        for (const { id, raw } of changes.versions ?? [])
          await tx.update(deckVersions).set({ raw }).where(eq(deckVersions.id, id))
        for (const { id, raw } of changes.snapshots ?? [])
          await tx.update(deckDraftSnapshots).set({ raw }).where(eq(deckDraftSnapshots.id, id))
        for (const { slug, ydoc } of changes.drafts ?? [])
          await tx.update(deckDrafts).set({ ydoc, ...stamp }).where(eq(deckDrafts.deckSlug, slug))
        for (const { slug, names } of changes.media ?? [])
          await recordDeckMedia(tx, slug, names)
        if (migration)
          await tx.insert(dataMigrations).values({ name: migration, appliedAt: new Date() })
        return changes
      })
    },
  }
}
