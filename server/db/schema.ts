import { blob, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * Deck identity + catalog/access axes. The published markdown itself lives in
 * `deckVersions` (immutable rows); `publishedVersionId` points at the one being
 * served. `status` defaults closed — a deck with no explicit status is private.
 */
export const decks = sqliteTable('decks', {
  slug: text('slug').primaryKey(),
  alias: text('alias').unique(),
  title: text('title').notNull(),
  status: text('status').notNull().default('private'),
  lifecycle: text('lifecycle').notNull().default('live'),
  project: text('project'),
  theme: text('theme'),
  accessPasswordHash: text('access_password_hash'),
  frozenBundle: text('frozen_bundle'),
  publishedVersionId: integer('published_version_id'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

/** One immutable row per publish; rollback is repointing `publishedVersionId`. */
export const deckVersions = sqliteTable('deck_versions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  deckSlug: text('deck_slug').notNull().references(() => decks.slug),
  raw: text('raw').notNull(),
  publishedBy: text('published_by').notNull(),
  publishedAt: integer('published_at', { mode: 'timestamp' }).notNull(),
})

/** Live collaborative state: the Y.Doc binary (encodeStateAsUpdate), debounced. */
export const deckDrafts = sqliteTable('deck_drafts', {
  deckSlug: text('deck_slug').primaryKey().references(() => decks.slug),
  ydoc: blob('ydoc', { mode: 'buffer' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})
