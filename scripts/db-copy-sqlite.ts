/**
 * Copy a local SQLite database into the PostgreSQL database of the environment,
 * PGlite in `.data/pglite` by default, which must be empty. The SQLite file
 * first takes its pending migrations.
 *
 *   node scripts/db-copy-sqlite.ts                       # .data/slides.db (or NUXT_DB_PATH)
 *   node scripts/db-copy-sqlite.ts --from=/path/to.db
 */
import process from 'node:process'
import { DEFAULT_SQLITE_PATH, describeDatabase, readDatabaseConfig } from '../layers/studio/server/db/config.ts'
import { copySqliteToPostgres } from '../layers/studio/server/db/postgres/copy-from-sqlite.ts'
import { connectPostgres, openPglite } from '../layers/studio/server/db/postgres/index.ts'
import { migrateSqlite, openSqliteFile } from '../layers/studio/server/db/sqlite/index.ts'

const from = process.argv.find(a => a.startsWith('--from='))?.slice(7) ?? (process.env.NUXT_DB_PATH || DEFAULT_SQLITE_PATH)
const config = readDatabaseConfig(process.env)
if (config.driver === 'sqlite') {
  console.error('NUXT_DATABASE_DRIVER=sqlite : la cible est déjà SQLite. Retirer ce réglage pour copier vers PGlite ou NUXT_DATABASE_URL.')
  process.exit(2)
}

const source = openSqliteFile(from, { readonly: false })
migrateSqlite(source)
const target = config.driver === 'pglite' ? await openPglite(config.dir) : connectPostgres(config.url)
try {
  await target.migrate()
  const copied = await copySqliteToPostgres(source, target.db)
  console.log(`copie de SQLite ${from} vers ${describeDatabase(config)}`)
  for (const [table, rows] of Object.entries(copied))
    console.log(`  · ${table} : ${rows}`)
}
finally {
  await target.close()
  source.$client.close()
}
