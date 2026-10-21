import type { SqliteDb } from '../sqlite/index.ts'
import type { PostgresDb } from './index.ts'
import { count, getTableName, sql } from 'drizzle-orm'
import * as sqlite from '../sqlite/schema.ts'
import * as postgres from './schema.ts'

/** The tables, each after the ones its foreign keys name. */
const TABLES = ['users', 'projects', 'decks', 'deckVersions', 'deckDraftSnapshots', 'deckDrafts', 'deckAliases', 'deckPermissions', 'projectPermissions', 'deckMedia', 'dataMigrations'] as const

/** The tables whose id comes from a sequence. */
const SEQUENCED = ['users', 'deckVersions', 'deckDraftSnapshots'] as const

/** Rows per insert, under the 65,535 parameters of a PostgreSQL statement. */
const BATCH = 1000

/**
 * Copies every row of a SQLite database into an empty PostgreSQL one, in one
 * transaction, then moves the id sequences past the ids the source gave, and
 * never back. Both schemas name their columns alike, so a row passes from one
 * to the other as it is. A server that started on the target has recorded its
 * data migrations there: the copy replaces these rows with the ones of the
 * source. Returns the number of rows copied per table.
 */
export async function copySqliteToPostgres(source: SqliteDb, target: PostgresDb): Promise<Record<string, number>> {
  const copied: Record<string, number> = {}
  await target.transaction(async (tx) => {
    for (const name of TABLES.filter(name => name !== 'dataMigrations')) {
      const [existing] = await tx.select({ n: count() }).from(postgres[name])
      if (existing!.n > 0)
        throw new Error(`The target database already holds rows in ${getTableName(postgres[name])}: copy into an empty database.`)
    }
    await tx.delete(postgres.dataMigrations)
    for (const name of TABLES) {
      const rows = source.select().from(sqlite[name]).all()
      for (let from = 0; from < rows.length; from += BATCH)
        await tx.insert(postgres[name]).values(rows.slice(from, from + BATCH) as any)
      copied[getTableName(postgres[name])] = rows.length
    }
    for (const name of SEQUENCED) {
      const table = postgres[name]
      // `sqlite_sequence` holds the highest id SQLite gave, a removed row's included.
      const given = source.get<{ seq: number } | undefined>(sql`select seq from sqlite_sequence where name = ${getTableName(sqlite[name])}`)?.seq ?? 0
      const sequence = sql`pg_get_serial_sequence(${getTableName(table)}, 'id')`
      await tx.execute(sql`select setval(${sequence}, greatest(coalesce(max(${table.id}), 0), ${given}, nextval(${sequence}))) from ${table}`)
    }
  })
  return copied
}
