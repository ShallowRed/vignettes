import type { Stores } from '../../../layers/studio/server/db/ports'
import type { SqliteDb } from '../../../layers/studio/server/db/sqlite/index'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach } from 'vitest'
import { createSqliteStores, migrateSqlite, openSqlite, runDataMigrations } from '../../../layers/studio/server/db/sqlite/index'
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
}

/** Every table, children first, so the foreign keys hold while the tables empty. */
export const TABLES: TableName[] = ['deckPermissions', 'projectPermissions', 'deckAliases', 'deckDrafts', 'deckDraftSnapshots', 'deckMedia', 'deckVersions', 'decks', 'projects', 'users', 'dataMigrations']

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
  return {
    stores: createSqliteStores(db),
    rows: sqliteRows(db),
    async migrateData() {
      runDataMigrations(db)
    },
    async reset() {
      emptySqlite(db)
    },
    async close() {
      db.$client.close()
    },
  }
}

export const ADAPTERS: StoreAdapter[] = [
  { name: 'sqlite', setup: setupSqlite },
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
  })
  beforeEach(() => open().reset())
  afterAll(() => fixture?.close())
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
