import type { Database } from '../db/open'
import type { Stores } from '../db/ports'
import { openDatabase } from '../db/open'
import { serverConfig } from './config'

let opening: Promise<Database> | undefined
let database: Database | undefined

/**
 * Opens the server's database and applies its schema and data migrations, once.
 * The boot plugin starts it and holds every request until it resolves; a code
 * path that reaches the stores outside a request, such as a websocket upgrade or
 * another plugin, awaits it first. `serverConfig().database` names the
 * database: a PostgreSQL server, or a PGlite directory or a SQLite file under
 * `.data/`, a volume in production, so the image stays immutable while the data
 * survives redeploys.
 */
export async function databaseReady(): Promise<void> {
  opening ??= (async () => {
    const db = await openDatabase(serverConfig().database)
    try {
      await db.migrateSchema()
      await db.migrateData()
    }
    catch (error) {
      await db.close()
      throw error
    }
    database = db
    return db
  })()
  await opening
}

/** The stores of the server's database: the one way the server reads and writes rows. */
export function useStores(): Stores {
  if (!database)
    throw new Error('The database is not ready: await databaseReady() before reaching the stores.')
  return database.stores
}

/** Closes the server's database; the next `databaseReady()` opens it again. */
export async function closeDatabase(): Promise<void> {
  const current = opening
  opening = undefined
  database = undefined
  const db = await current?.catch(() => undefined)
  await db?.close()
}
