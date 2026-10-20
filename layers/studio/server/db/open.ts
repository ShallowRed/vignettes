import type { DatabaseConfig } from './config.ts'
import type { Stores } from './ports.ts'
import type { PostgresConnection } from './postgres/index.ts'
import type { SqliteDb } from './sqlite/index.ts'
import { existsSync } from 'node:fs'
import { DEFAULT_SQLITE_PATH } from './config.ts'
import { runDataMigrations } from './data-migrations.ts'
import { connectPostgres, createPostgresStores, openPglite } from './postgres/index.ts'
import { createSqliteStores, migrateSqlite, openSqlite, openSqliteFile } from './sqlite/index.ts'

/**
 * Opens the database the configuration names and its stores, for the server
 * (`databaseReady()` in `server/utils/db.ts`) and for the scripts. The scripts
 * run this module and the adapters with Node, so these files name the modules
 * they import by relative path, with their extension.
 */

export interface Database {
  stores: Stores
  /** Applies the pending schema migrations. */
  migrateSchema: () => Promise<void>
  /** Runs the data migrations not applied yet, once the schema is current. */
  migrateData: () => Promise<void>
  close: () => Promise<void>
}

function sqliteDatabase(db: SqliteDb): Database {
  const stores = createSqliteStores(db)
  return {
    stores,
    async migrateSchema() {
      migrateSqlite(db)
    },
    migrateData: () => runDataMigrations(stores.rewrites),
    async close() {
      db.$client.close()
    },
  }
}

function postgresDatabase(connection: PostgresConnection): Database {
  const stores = createPostgresStores(connection.db)
  return {
    stores,
    migrateSchema: () => connection.exclusive(connection.migrate),
    migrateData: () => connection.exclusive(() => runDataMigrations(stores.rewrites)),
    close: connection.close,
  }
}

/** The server's database, created when missing. */
export async function openDatabase(config: DatabaseConfig): Promise<Database> {
  if (config.driver === 'sqlite')
    return sqliteDatabase(openSqlite(config.path))
  if (config.driver === 'postgres')
    return postgresDatabase(connectPostgres(config.url))
  if (!existsSync(config.dir) && existsSync(DEFAULT_SQLITE_PATH))
    console.warn(`[database] ${config.dir} is created empty, and ${DEFAULT_SQLITE_PATH} holds a SQLite database: copy it with \`mise run db:copy-sqlite\`, or keep it with NUXT_DATABASE_DRIVER=sqlite.`)
  return postgresDatabase(await openPglite(config.dir))
}

/** A script's database: one that exists, and a SQLite file read-only unless the script writes. */
export async function openDatabaseFile(config: DatabaseConfig, { readonly }: { readonly: boolean }): Promise<Database> {
  if (config.driver === 'sqlite')
    return sqliteDatabase(openSqliteFile(config.path, { readonly }))
  if (config.driver === 'postgres')
    return postgresDatabase(connectPostgres(config.url))
  return postgresDatabase(await openPglite(config.dir, { create: false }))
}
