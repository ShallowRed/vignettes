import { boolean, customType, index, integer, json, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

/**
 * The PostgreSQL tables, with the names, columns and TypeScript keys of the
 * SQLite schema (`../sqlite/schema.ts`), which documents each of them.
 */

/** A binary column; drizzle-orm 0.45 has none for PostgreSQL. */
const bytea = customType<{ data: Uint8Array, driverData: Uint8Array }>({
  dataType: () => 'bytea',
})

/** A date to the millisecond, the precision of a JavaScript `Date`. */
const date = (name: string) => timestamp(name, { mode: 'date', withTimezone: true, precision: 3 })

export const decks = pgTable('decks', {
  slug: text('slug').primaryKey(),
  alias: text('alias').unique(),
  title: text('title').notNull(),
  status: text('status').notNull().default('private'),
  lifecycle: text('lifecycle').notNull().default('live'),
  project: text('project'),
  theme: text('theme'),
  accessPasswordHash: text('access_password_hash'),
  frozenBundle: text('frozen_bundle'),
  unlisted: boolean('unlisted').notNull().default(false),
  family: text('family'),
  variantLabel: text('variant_label'),
  supersededBy: text('superseded_by'),
  managed: boolean('managed').notNull().default(false),
  publishedVersionId: integer('published_version_id'),
  deletedAt: date('deleted_at'),
  createdAt: date('created_at').notNull(),
  updatedAt: date('updated_at').notNull(),
})

export const deckVersions = pgTable('deck_versions', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  deckSlug: text('deck_slug').notNull().references(() => decks.slug),
  raw: text('raw').notNull(),
  publishedBy: text('published_by').notNull(),
  publishedAt: date('published_at').notNull(),
}, table => [index('deck_versions_deck_slug_idx').on(table.deckSlug)])

export const deckDraftSnapshots = pgTable('deck_draft_snapshots', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  deckSlug: text('deck_slug').notNull().references(() => decks.slug),
  raw: text('raw').notNull(),
  authors: json('authors').$type<string[]>().notNull(),
  label: text('label'),
  createdAt: date('created_at').notNull(),
}, table => [index('deck_draft_snapshots_deck_slug_idx').on(table.deckSlug)])

export const deckDrafts = pgTable('deck_drafts', {
  deckSlug: text('deck_slug').primaryKey().references(() => decks.slug),
  ydoc: bytea('ydoc').notNull(),
  updatedAt: date('updated_at').notNull(),
})

/**
 * `id` takes the next value of its identity sequence, which only grows, as the
 * SQLite `AUTOINCREMENT`: an id is never given twice, historical GitHub ids
 * included.
 */
export const users = pgTable('users', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  provider: text('provider').notNull().default('github'),
  providerId: text('provider_id').notNull().default(''),
  login: text('login').notNull().unique(),
  name: text('name'),
  avatarUrl: text('avatar_url'),
  role: text('role').notNull().default('viewer'),
  createdAt: date('created_at').notNull(),
  lastLoginAt: date('last_login_at').notNull(),
  sessionVersion: integer('session_version').notNull().default(0),
}, table => [uniqueIndex('users_provider_identity').on(table.provider, table.providerId)])

export const projects = pgTable('projects', {
  slug: text('slug').primaryKey(),
  title: text('title').notNull(),
  order: integer('order').notNull().default(0),
  color: text('color'),
  icon: text('icon'),
  deletedAt: date('deleted_at'),
  createdAt: date('created_at').notNull(),
  updatedAt: date('updated_at').notNull(),
})

export const deckAliases = pgTable('deck_aliases', {
  alias: text('alias').primaryKey(),
  deckSlug: text('deck_slug').notNull().references(() => decks.slug),
})

export const deckPermissions = pgTable('deck_permissions', {
  deckSlug: text('deck_slug').notNull().references(() => decks.slug),
  userId: integer('user_id').notNull().references(() => users.id),
  role: text('role').notNull(),
  grantedBy: text('granted_by').notNull(),
  createdAt: date('created_at').notNull(),
  expiresAt: date('expires_at'),
}, table => [primaryKey({ columns: [table.deckSlug, table.userId] })])

export const projectPermissions = pgTable('project_permissions', {
  projectSlug: text('project_slug').notNull().references(() => projects.slug),
  userId: integer('user_id').notNull().references(() => users.id),
  role: text('role').notNull(),
  grantedBy: text('granted_by').notNull(),
  createdAt: date('created_at').notNull(),
  expiresAt: date('expires_at'),
}, table => [primaryKey({ columns: [table.projectSlug, table.userId] })])

export const deckMedia = pgTable('deck_media', {
  mediaName: text('media_name').notNull(),
  deckSlug: text('deck_slug').notNull().references(() => decks.slug),
  createdAt: date('created_at').notNull(),
  origin: boolean('origin').notNull().default(false),
}, table => [primaryKey({ columns: [table.mediaName, table.deckSlug] })])

export const dataMigrations = pgTable('data_migrations', {
  name: text('name').primaryKey(),
  appliedAt: date('applied_at').notNull(),
})
