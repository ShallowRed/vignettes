import { blob, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

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
  unlisted: integer('unlisted', { mode: 'boolean' }).notNull().default(false),
  /** True once a publish or an admin edit made this row the metadata truth; plain draft anchors stay false. */
  managed: integer('managed', { mode: 'boolean' }).notNull().default(false),
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

/**
 * Identities seen at GitHub login. `role` is the runtime truth — the env login
 * map only seeds it on first login. Defaults to the least-privileged role.
 */
export const users = sqliteTable('users', {
  id: integer('id').primaryKey(),
  login: text('login').notNull().unique(),
  name: text('name'),
  avatarUrl: text('avatar_url'),
  role: text('role').notNull().default('viewer'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  lastLoginAt: integer('last_login_at', { mode: 'timestamp' }).notNull(),
})

/** Catalog grouping axis (absorbs projects.yml). */
export const projects = sqliteTable('projects', {
  slug: text('slug').primaryKey(),
  title: text('title').notNull(),
  order: integer('order').notNull().default(0),
  color: text('color'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

/** Historical paths redirected to a deck; the canonical alias stays on `decks.alias`. */
export const deckAliases = sqliteTable('deck_aliases', {
  alias: text('alias').primaryKey(),
  deckSlug: text('deck_slug').notNull().references(() => decks.slug),
})

/** Per-deck grant escalating a user beyond their global role ('editor' | 'viewer'). */
export const deckPermissions = sqliteTable('deck_permissions', {
  deckSlug: text('deck_slug').notNull().references(() => decks.slug),
  userId: integer('user_id').notNull().references(() => users.id),
  role: text('role').notNull(),
  grantedBy: text('granted_by').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, table => [primaryKey({ columns: [table.deckSlug, table.userId] })])

/**
 * Project-scoped grant: a master key over every deck in the project (private ones
 * included). Folded with any per-deck grant at resolution — the stronger wins.
 */
export const projectPermissions = sqliteTable('project_permissions', {
  projectSlug: text('project_slug').notNull().references(() => projects.slug),
  userId: integer('user_id').notNull().references(() => users.id),
  role: text('role').notNull(),
  grantedBy: text('granted_by').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, table => [primaryKey({ columns: [table.projectSlug, table.userId] })])
