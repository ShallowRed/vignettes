import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type { ContentRewrites, StoredContent } from '../ports.ts'
import { Buffer } from 'node:buffer'
import { eq } from 'drizzle-orm'
import { recordDeckMedia } from './media-index.ts'
import { dataMigrations, deckDrafts, deckDraftSnapshots, decks, deckVersions } from './schema.ts'

type Db = BetterSQLite3Database<Record<string, unknown>>

function readContent(db: Db): StoredContent {
  return {
    decks: db.select({ slug: decks.slug, theme: decks.theme }).from(decks).all(),
    versions: db.select({ id: deckVersions.id, slug: deckVersions.deckSlug, raw: deckVersions.raw }).from(deckVersions).all(),
    snapshots: db.select({ id: deckDraftSnapshots.id, slug: deckDraftSnapshots.deckSlug, raw: deckDraftSnapshots.raw }).from(deckDraftSnapshots).all(),
    drafts: db.select({ slug: deckDrafts.deckSlug, ydoc: deckDrafts.ydoc }).from(deckDrafts).all().map(({ slug, ydoc }) => ({ slug, ydoc: new Uint8Array(ydoc) })),
  }
}

/** SQLite adapter for the rewrites of the stored content. */
export function createContentRewrites(db: Db): ContentRewrites {
  return {
    async appliedMigrations() {
      return new Set(db.select({ name: dataMigrations.name }).from(dataMigrations).all().map(row => row.name))
    },

    async read() {
      return readContent(db)
    },

    async rewrite(change, { migration, at } = {}) {
      return db.transaction((tx) => {
        const changes = change(readContent(tx))
        const stamp = at ? { updatedAt: at } : {}
        for (const { slug, theme } of changes.themes ?? [])
          tx.update(decks).set({ theme, ...stamp }).where(eq(decks.slug, slug)).run()
        for (const { id, raw } of changes.versions ?? [])
          tx.update(deckVersions).set({ raw }).where(eq(deckVersions.id, id)).run()
        for (const { id, raw } of changes.snapshots ?? [])
          tx.update(deckDraftSnapshots).set({ raw }).where(eq(deckDraftSnapshots.id, id)).run()
        for (const { slug, ydoc } of changes.drafts ?? [])
          tx.update(deckDrafts).set({ ydoc: Buffer.from(ydoc), ...stamp }).where(eq(deckDrafts.deckSlug, slug)).run()
        for (const { slug, names } of changes.media ?? [])
          recordDeckMedia(tx, slug, names)
        if (migration)
          tx.insert(dataMigrations).values({ name: migration, appliedAt: new Date() }).run()
        return changes
      })
    },
  }
}
