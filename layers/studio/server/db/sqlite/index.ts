import type { Stores } from '../ports.ts'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { createContentArchive } from './archive.ts'
import { createCatalogStore } from './catalog.ts'
import { createContentRewrites } from './content-rewrites.ts'
import { createDbContent } from './content-store.ts'
import { createDeckMeta } from './deck-meta.ts'
import { createDbDirectory } from './directory.ts'
import { createDraftStore } from './draft-store.ts'
import { createMediaIndex } from './media-index.ts'
import { createPermissionStore } from './permission-store.ts'
import { createProjectPermissionStore } from './project-permission-store.ts'
import { createProjectStore } from './project-store.ts'
import * as schema from './schema.ts'
import { createSnapshotStore } from './snapshot-store.ts'
import { createUserStore } from './user-store.ts'
import { createVersionHistory } from './version-history.ts'

export type SqliteDb = ReturnType<typeof drizzle<typeof schema>>

/**
 * The server's connection: creates the file and its folder, writes ahead
 * (concurrent reads during writes) and enforces the foreign keys.
 */
export function openSqlite(path: string): SqliteDb {
  mkdirSync(dirname(path), { recursive: true })
  const sqlite = new Database(path)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  return drizzle(sqlite, { schema })
}

/** A script's connection to an existing file, opened as it is. */
export function openSqliteFile(path: string, { readonly }: { readonly: boolean }): SqliteDb {
  return drizzle(new Database(path, { readonly, fileMustExist: true }), { schema })
}

/** The migrations folder of the repository, from its root. */
export const MIGRATIONS_DIR = 'layers/studio/server/db/sqlite/migrations'

/** The migrations: the repository folder in development, the copy shipped with the output in production. */
const MIGRATION_FOLDERS = [MIGRATIONS_DIR, '.output/server/migrations/sqlite']

/** The foreign keys that name no row: how many, and the first table that holds one. */
function orphanRows(db: SqliteDb): string | undefined {
  const rows = db.$client.pragma('foreign_key_check') as { table: string, parent: string }[]
  return rows.length > 0 ? `foreign keys that name no row (${rows.length}), the first in ${rows[0]!.table}, parent ${rows[0]!.parent}` : undefined
}

/** How many migrations the database has recorded. */
function appliedMigrations(db: SqliteDb): number {
  const recorded = db.$client.prepare(`select 1 from sqlite_master where type = 'table' and name = '__drizzle_migrations'`).get()
  return recorded ? (db.$client.prepare('select count(*) as n from __drizzle_migrations').get() as { n: number }).n : 0
}

/**
 * Applies the pending schema migrations. A migration that rebuilds a table drops
 * it while other tables reference it, and drizzle runs the migrations in one
 * transaction, where its `PRAGMA foreign_keys=OFF` has no effect. So the foreign
 * keys are off for the whole run, as the SQLite procedure for a table change
 * prescribes (https://sqlite.org/lang_altertable.html#otheralter). That procedure
 * checks the keys before it commits, and drizzle commits by itself: the keys are
 * checked before the run, for the rows already orphaned, and after a run that
 * applied a migration: drizzle has committed it, so a failed check leaves it
 * recorded.
 */
export function migrateSqlite(db: SqliteDb): void {
  const migrationsFolder = MIGRATION_FOLDERS.map(folder => join(process.cwd(), folder)).find(existsSync)
  if (!migrationsFolder)
    throw new Error(`No migrations folder found (looked in ${MIGRATION_FOLDERS.join(' and ')})`)
  const orphaned = orphanRows(db)
  if (orphaned)
    throw new Error(`The database holds ${orphaned}, before the migrations`)
  const applied = appliedMigrations(db)
  const enforced = db.$client.pragma('foreign_keys', { simple: true }) === 1
  db.$client.pragma('foreign_keys = OFF')
  try {
    migrate(db, { migrationsFolder })
  }
  finally {
    if (enforced)
      db.$client.pragma('foreign_keys = ON')
  }
  const left = appliedMigrations(db) > applied ? orphanRows(db) : undefined
  if (left)
    throw new Error(`The migrations left ${left}`)
}

/** The SQLite adapter of the storage ports. */
export function createSqliteStores(db: SqliteDb): Stores {
  const directory = createDbDirectory(db)
  return {
    content: createDbContent(db),
    versionHistory: createVersionHistory(db),
    deckMeta: createDeckMeta(db),
    deckDirectory: directory.decks,
    projectDirectory: directory.projects,
    projects: createProjectStore(db),
    deckGrants: createPermissionStore(db),
    projectGrants: createProjectPermissionStore(db),
    users: createUserStore(db),
    drafts: createDraftStore(db),
    snapshots: createSnapshotStore(db),
    mediaIndex: createMediaIndex(db),
    catalog: createCatalogStore(db),
    archive: createContentArchive(db),
    rewrites: createContentRewrites(db),
  }
}
