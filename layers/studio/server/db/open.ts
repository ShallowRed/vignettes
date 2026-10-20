import type { DatabaseConfig } from './config.ts'
import type { Stores } from './ports.ts'
import type { SqliteDb } from './sqlite/index.ts'
import { createSqliteStores, migrateSqlite, openSqlite, openSqliteFile, runDataMigrations } from './sqlite/index.ts'

/**
 * Opens the database and its stores, for the server (`useStores()` in
 * `server/utils/db.ts`) and for the scripts. The scripts run this module and the
 * adapter with Node, so these files name the modules they import by relative
 * path, with their extension.
 */

export interface Database {
  stores: Stores
  /** Applies the pending schema migrations. */
  migrateSchema: () => Promise<void>
  /** Runs the data migrations not applied yet, once the schema is current. */
  migrateData: () => Promise<void>
}

/**
 * The SQLite database also migrates synchronously: the boot plugin runs that
 * variant, since Nitro calls its plugins without awaiting them, and a migration
 * that throws stops the start.
 */
export interface SqliteDatabase extends Database {
  /** Applies the pending schema migrations, then the data migrations. */
  migrateNow: () => void
}

function database(db: SqliteDb): SqliteDatabase {
  return {
    stores: createSqliteStores(db),
    async migrateSchema() {
      migrateSqlite(db)
    },
    async migrateData() {
      runDataMigrations(db)
    },
    migrateNow() {
      migrateSqlite(db)
      runDataMigrations(db)
    },
  }
}

/** The server's database, created when missing. */
export function openDatabase(config: DatabaseConfig): SqliteDatabase {
  return database(openSqlite(config.dbPath))
}

/** A script's database: an existing file, read-only unless the script writes. */
export function openDatabaseFile(config: DatabaseConfig, { readonly }: { readonly: boolean }): Database {
  return database(openSqliteFile(config.dbPath, { readonly }))
}
