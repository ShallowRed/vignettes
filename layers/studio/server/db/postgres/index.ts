import type { SQL } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import type { Stores } from '../ports.ts'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { PGlite } from '@electric-sql/pglite'
import { sql } from 'drizzle-orm'
import { drizzle as drizzleNodePostgres } from 'drizzle-orm/node-postgres'
import { migrate as migrateNodePostgres } from 'drizzle-orm/node-postgres/migrator'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'
import pg from 'pg'
import { createContentArchive } from './archive.ts'
import { createCatalogStore } from './catalog.ts'
import { createContentRewrites } from './content-rewrites.ts'
import { createDbContent } from './content-store.ts'
import { createDeckMeta } from './deck-meta.ts'
import { createDbDirectory } from './directory.ts'
import { createDraftStore } from './draft-store.ts'
import { createMediaIndex } from './media-index.ts'
import { createPermissionStore } from './permission-store.ts'
import { lockPgliteDir } from './pglite-lock.ts'
import { createProjectPermissionStore } from './project-permission-store.ts'
import { createProjectStore } from './project-store.ts'
import * as schema from './schema.ts'
import { createSnapshotStore } from './snapshot-store.ts'
import { createUserStore } from './user-store.ts'
import { createVersionHistory } from './version-history.ts'

/** A PostgreSQL database or transaction, through node-postgres or PGlite. */
export type PostgresDb = PgDatabase<PgQueryResultHKT, typeof schema>

/** An open PostgreSQL database and what its driver does for it. */
export interface PostgresConnection {
  db: PostgresDb
  /** Applies the pending schema migrations. */
  migrate: () => Promise<void>
  /**
   * Runs `work` while this connection holds the migration lock of the
   * database. Two containers start together during a deployment: the second
   * waits, then finds the migrations applied.
   */
  exclusive: <T>(work: () => Promise<T>) => Promise<T>
  close: () => Promise<void>
}

/** The key of the advisory lock the migrations take. */
const MIGRATION_LOCK = sql`hashtext('vignettes.migrations')`

/** Runs `work` between the lock and the unlock that `query` sends on one session. */
async function withMigrationLock<T>(query: (statement: SQL) => Promise<unknown>, work: () => Promise<T>): Promise<T> {
  await query(sql`select pg_advisory_lock(${MIGRATION_LOCK})`)
  try {
    return await work()
  }
  finally {
    await query(sql`select pg_advisory_unlock(${MIGRATION_LOCK})`)
  }
}

/** The migrations folder of the repository, from its root. */
export const MIGRATIONS_DIR = 'layers/studio/server/db/postgres/migrations'

/** The migrations: the repository folder in development, the copy shipped with the output in production. */
const MIGRATION_FOLDERS = [MIGRATIONS_DIR, '.output/server/migrations/postgres']

function migrationsFolder(): string {
  const folder = MIGRATION_FOLDERS.map(path => join(process.cwd(), path)).find(existsSync)
  if (!folder)
    throw new Error(`No migrations folder found (looked in ${MIGRATION_FOLDERS.join(' and ')})`)
  return folder
}

/**
 * Connections to a PostgreSQL server; the URL's `sslmode` sets TLS. Two
 * containers run together during a deployment, and the smallest managed plans
 * accept 30 connections.
 */
const POOL_SIZE = 5

/** A PostgreSQL server, through a small pool of node-postgres connections. */
export function connectPostgres(url: string): PostgresConnection {
  const pool = new pg.Pool({ connectionString: url, max: POOL_SIZE })
  const db = drizzleNodePostgres({ client: pool, schema })
  return {
    db,
    migrate: () => migrateNodePostgres(db, { migrationsFolder: migrationsFolder() }),
    async exclusive(work) {
      // A session lock: one client of the pool holds it while the others migrate.
      const client = await pool.connect()
      try {
        return await withMigrationLock(statement => drizzleNodePostgres({ client }).execute(statement), work)
      }
      finally {
        client.release()
      }
    },
    close: () => pool.end(),
  }
}

/**
 * PGlite, PostgreSQL in the process: in memory without a directory, or in that
 * directory, locked for this process. `create` makes a missing directory.
 */
export async function openPglite(dir?: string, { create = true }: { create?: boolean } = {}): Promise<PostgresConnection> {
  let release = () => {}
  if (dir) {
    if (!create && !existsSync(dir))
      throw new Error(`No PGlite database in ${dir}: run \`mise run db:migrate\` first.`)
    mkdirSync(dirname(dir), { recursive: true })
    release = await lockPgliteDir(dir)
  }
  try {
    const client = await PGlite.create(dir)
    const db = drizzlePglite({ client, schema })
    return {
      db,
      migrate: () => migratePglite(db, { migrationsFolder: migrationsFolder() }),
      exclusive: work => withMigrationLock(statement => db.execute(statement), work),
      async close() {
        await client.close()
        release()
      },
    }
  }
  catch (error) {
    release()
    throw error
  }
}

/** The PostgreSQL adapter of the storage ports, over node-postgres or PGlite. */
export function createPostgresStores(db: PostgresDb): Stores {
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
