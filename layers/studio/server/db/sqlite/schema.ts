import { blob, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

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
  /** Decks sharing a family are variants of one presentation (a language, a format), shown as one card. A family is this free text, with no row of its own; `shared/presentations/family.ts` keeps it inside one folder. */
  family: text('family'),
  /** What sets this deck apart within its family: `FR`, `EN`, `Vidéo`. */
  variantLabel: text('variant_label'),
  /** The deck that replaces this one; the folder lists it among the former versions. */
  supersededBy: text('superseded_by'),
  /** True once a publish or an admin edit made this row the metadata truth; plain draft anchors stay false. */
  managed: integer('managed', { mode: 'boolean' }).notNull().default(false),
  publishedVersionId: integer('published_version_id'),
  /** Non-null once trashed: soft-deleted, hidden everywhere but restorable. */
  deletedAt: integer('deleted_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

/**
 * One immutable row per publish: the history of a deck. Restoring a version
 * copies its markdown into the draft, which is then published again, so the
 * history stays append-only.
 */
export const deckVersions = sqliteTable('deck_versions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  deckSlug: text('deck_slug').notNull().references(() => decks.slug),
  raw: text('raw').notNull(),
  publishedBy: text('published_by').notNull(),
  publishedAt: integer('published_at', { mode: 'timestamp' }).notNull(),
}, table => [index('deck_versions_deck_slug_idx').on(table.deckSlug)])

/**
 * The draft as it was at some moment: taken while people edit (at most one
 * every few minutes, plus one when the last editor leaves), on a solo save,
 * before a restore, and on demand with a label. Pruned by `snapshotsToDrop`,
 * except the labelled ones.
 */
export const deckDraftSnapshots = sqliteTable('deck_draft_snapshots', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  deckSlug: text('deck_slug').notNull().references(() => decks.slug),
  raw: text('raw').notNull(),
  /** Logins of the accounts that edited since the previous snapshot. */
  authors: text('authors', { mode: 'json' }).$type<string[]>().notNull(),
  label: text('label'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, table => [index('deck_draft_snapshots_deck_slug_idx').on(table.deckSlug)])

/** Live collaborative state: the Y.Doc binary (encodeStateAsUpdate), debounced. */
export const deckDrafts = sqliteTable('deck_drafts', {
  deckSlug: text('deck_slug').primaryKey().references(() => decks.slug),
  ydoc: blob('ydoc', { mode: 'buffer' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

/**
 * Identities seen at OAuth login. `id` is an internal key (historically the
 * GitHub numeric id; new rows autoincrement above it) — the external identity is
 * `(provider, providerId)`, kept as text because Google subs overflow JS numbers.
 * `role` is the runtime truth — the env login map only seeds it on first login.
 * Defaults to the least-privileged role. For Google accounts `login` is the email
 * (GitHub logins cannot contain `@`, so the namespaces cannot collide).
 */
export const users = sqliteTable('users', {
  id: integer('id').primaryKey(),
  provider: text('provider').notNull().default('github'),
  providerId: text('provider_id').notNull().default(''),
  login: text('login').notNull().unique(),
  name: text('name'),
  avatarUrl: text('avatar_url'),
  role: text('role').notNull().default('viewer'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  lastLoginAt: integer('last_login_at', { mode: 'timestamp' }).notNull(),
}, table => [uniqueIndex('users_provider_identity').on(table.provider, table.providerId)])

/** Catalog grouping axis (absorbs projects.yml). */
export const projects = sqliteTable('projects', {
  slug: text('slug').primaryKey(),
  title: text('title').notNull(),
  order: integer('order').notNull().default(0),
  color: text('color'),
  /** Lucide icon name (bare, no prefix); null = the default folder icon. */
  icon: text('icon'),
  /** Non-null once trashed: soft-deleted with its decks, restorable as a whole. */
  deletedAt: integer('deleted_at', { mode: 'timestamp' }),
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
  /** Null = no expiry. Past = the grant no longer resolves (kept listed for the owner). */
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
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
  /** Null = no expiry. Past = the grant no longer resolves (kept listed for the owner). */
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
}, table => [primaryKey({ columns: [table.projectSlug, table.userId] })])

/**
 * Which decks reference an uploaded image. `/media/<name>` is served with the
 * visibility of the deck it was uploaded to; the other rows record the reuse
 * without widening the access. Rows are removed only when the deck is purged.
 */
export const deckMedia = sqliteTable('deck_media', {
  mediaName: text('media_name').notNull(),
  deckSlug: text('deck_slug').notNull().references(() => decks.slug),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  /** True on the deck the image was uploaded to, the one whose access rules it follows. */
  origin: integer('origin', { mode: 'boolean' }).notNull().default(false),
}, table => [primaryKey({ columns: [table.mediaName, table.deckSlug] })])

/** One row per data migration run at boot, so a rewrite of the content applies once. */
export const dataMigrations = sqliteTable('data_migrations', {
  name: text('name').primaryKey(),
  appliedAt: integer('applied_at', { mode: 'timestamp' }).notNull(),
})
