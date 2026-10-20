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

/** Applies the pending schema migrations. */
export function migrateSqlite(db: SqliteDb): void {
  const migrationsFolder = MIGRATION_FOLDERS.map(folder => join(process.cwd(), folder)).find(existsSync)
  if (!migrationsFolder)
    throw new Error(`No migrations folder found (looked in ${MIGRATION_FOLDERS.join(' and ')})`)
  migrate(db, { migrationsFolder })
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
