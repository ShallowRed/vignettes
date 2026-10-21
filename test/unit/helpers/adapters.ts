import type { Stores } from '../../../layers/studio/server/db/ports'
import type { PostgresDb } from '../../../layers/studio/server/db/postgres/index'
import type { SqliteDb } from '../../../layers/studio/server/db/sqlite/index'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/pglite'
import { afterAll, beforeAll, beforeEach, inject } from 'vitest'
import { runDataMigrations } from '../../../layers/studio/server/db/data-migrations'
import { createPostgresStores } from '../../../layers/studio/server/db/postgres/index'
import * as pgSchema from '../../../layers/studio/server/db/postgres/schema'
import { createSqliteStores, migrateSqlite, openSqlite } from '../../../layers/studio/server/db/sqlite/index'
import * as schema from '../../../layers/studio/server/db/sqlite/schema'

/**
 * The adapters the contract suites run against. A suite takes each entry with
 * `describe.each(ADAPTERS)` and reaches the stores through {@link useAdapter}.
 */

/** A fixed clock for rows whose timestamps do not matter to the test. */
export const NOW = new Date(1700000000000)

type Tables = typeof schema
export type TableName = keyof Tables
export type Row<T extends TableName> = Tables[T]['$inferSelect']
export type NewRow<T extends TableName> = Tables[T]['$inferInsert']

/**
 * Rows of a table, named and shaped as in the SQLite schema, for setting up and
 * checking what no store method exposes. `where` matches every given column.
 */
export interface Rows {
  insert: <T extends TableName>(table: T, values: NewRow<T> | NewRow<T>[]) => Promise<Row<T>[]>
  select: <T extends TableName>(table: T, where?: Partial<Row<T>>) => Promise<Row<T>[]>
  update: <T extends TableName>(table: T, set: Partial<NewRow<T>>, where: Partial<Row<T>>) => Promise<void>
}

export interface AdapterFixture {
  stores: Stores
  rows: Rows
  /** Runs the data migrations not applied yet. */
  migrateData: () => Promise<void>
  /** Empties every table and restarts the ids. */
  reset: () => Promise<void>
  close: () => Promise<void>
}

export interface StoreAdapter {
  name: string
  /** A migrated, empty database of this adapter. */
  setup: () => Promise<AdapterFixture>
  /** How long the setup may take, in milliseconds. */
  setupTimeout: number
}

/** Every table, children first, so the foreign keys hold while the tables empty. */
export const TABLES: TableName[] = ['personalTokens', 'deckPermissions', 'projectPermissions', 'deckAliases', 'deckDrafts', 'deckDraftSnapshots', 'deckMedia', 'deckVersions', 'decks', 'projects', 'users', 'dataMigrations']

const table = (name: TableName) => schema[name] as any

/** {@link Rows} over a drizzle SQLite connection. */
export function sqliteRows(db: SqliteDb): Rows {
  const matching = (name: TableName, where: Record<string, unknown> = {}) =>
    and(...Object.entries(where).map(([column, value]) => value === null ? isNull(table(name)[column]) : eq(table(name)[column], value)))

  return {
    async insert(name, values) {
      return db.insert(table(name)).values(values as any).returning().all() as any
    },
    async select(name, where) {
      return db.select().from(table(name)).where(matching(name, where)).all() as any
    },
    async update(name, set, where) {
      db.update(table(name)).set(set as any).where(matching(name, where)).run()
    },
  }
}

/** An in-memory SQLite database, migrated, with the foreign keys enforced. */
export function freshSqlite(): SqliteDb {
  const db = openSqlite(':memory:')
  migrateSqlite(db)
  return db
}

/** Empties every table of a SQLite database and restarts its ids. */
export function emptySqlite(db: SqliteDb): void {
  for (const name of TABLES)
    db.delete(table(name)).run()
  db.run(sql`delete from sqlite_sequence`)
}

async function setupSqlite(): Promise<AdapterFixture> {
  const db = freshSqlite()
  const stores = createSqliteStores(db)
  return {
    stores,
    rows: sqliteRows(db),
    migrateData: () => runDataMigrations(stores.rewrites),
    async reset() {
      emptySqlite(db)
    },
    async close() {
      db.$client.close()
    },
  }
}

const pgTable = (name: TableName) => pgSchema[name] as any

/**
 * {@link Rows} over a PostgreSQL connection. A select lists the rows by primary
 * key, the order SQLite gives its rowid tables.
 */
export function postgresRows(db: PostgresDb): Rows {
  const matching = (name: TableName, where: Record<string, unknown> = {}) =>
    and(...Object.entries(where).map(([column, value]) => value === null ? isNull(pgTable(name)[column]) : eq(pgTable(name)[column], value)))
  const primaryKey = (name: TableName) => {
    const config = getTableConfig(pgTable(name))
    const columns = config.primaryKeys[0]?.columns ?? config.columns.filter(column => column.primary)
    return columns.map(column => asc(column))
  }

  return {
    async insert(name, values) {
      return db.insert(pgTable(name)).values(values as any).returning() as any
    },
    async select(name, where) {
      return db.select().from(pgTable(name)).where(matching(name, where)).orderBy(...primaryKey(name)) as any
    },
    async update(name, set, where) {
      await db.update(pgTable(name)).set(set as any).where(matching(name, where))
    },
  }
}

/** Every table, by its SQL name, for the reset between tests. */
const PG_TABLES = TABLES.map(name => getTableConfig(pgTable(name)).name).join(', ')

/** PGlite starts a PostgreSQL in WebAssembly: several seconds on a CI runner. */
export const PGLITE_TIMEOUT = 60_000

/** An in-memory PGlite database, loaded from the migrated template of the run (`pglite-template.ts`). */
export async function freshPglite(): Promise<{ db: PostgresDb, close: () => Promise<void> }> {
  const client = await PGlite.create({ loadDataDir: new Blob([readFileSync(inject('pgliteTemplate'))]) })
  return { db: drizzle({ client, schema: pgSchema }), close: () => client.close() }
}

async function setupPglite(): Promise<AdapterFixture> {
  const { db, close } = await freshPglite()
  const stores = createPostgresStores(db)
  return {
    stores,
    rows: postgresRows(db),
    migrateData: () => runDataMigrations(stores.rewrites),
    async reset() {
      await db.execute(sql.raw(`truncate ${PG_TABLES} restart identity cascade`))
    },
    close,
  }
}

export const ADAPTERS: StoreAdapter[] = [
  { name: 'sqlite', setup: setupSqlite, setupTimeout: 10_000 },
  { name: 'pglite', setup: setupPglite, setupTimeout: PGLITE_TIMEOUT },
]

/**
 * Opens the adapter once for the file and empties it before every test. The
 * returned object reads the open fixture, so a suite can hold it from its body.
 */
export function useAdapter(adapter: StoreAdapter): AdapterFixture {
  let fixture: AdapterFixture | undefined
  const open = () => {
    if (!fixture)
      throw new Error(`the ${adapter.name} adapter is used outside a test`)
    return fixture
  }
  beforeAll(async () => {
    fixture = await adapter.setup()
  }, adapter.setupTimeout)
  beforeEach(() => open().reset())
  afterAll(() => fixture?.close(), adapter.setupTimeout)
  return {
    get stores() {
      return open().stores
    },
    get rows() {
      return open().rows
    },
    migrateData: () => open().migrateData(),
    reset: () => open().reset(),
    close: () => open().close(),
  }
}

/** A deck row with fail-closed defaults, written past the stores. */
export async function seedDeck(rows: Rows, slug: string, over: Partial<NewRow<'decks'>> = {}): Promise<void> {
  await rows.insert('decks', { slug, title: slug, createdAt: NOW, updatedAt: NOW, ...over })
}

/** A user row; `providerId` defaults to the id so the identity index stays unique. */
export async function seedUser(rows: Rows, id: number, login: string, over: Partial<NewRow<'users'>> = {}): Promise<void> {
  await rows.insert('users', { id, login, providerId: String(id), createdAt: NOW, lastLoginAt: NOW, ...over })
}
