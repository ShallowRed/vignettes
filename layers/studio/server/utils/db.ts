import type { SqliteDatabase } from '../db/open'
import type { Stores } from '../db/ports'
import { openDatabase } from '../db/open'
import { serverConfig } from './config'

let instance: SqliteDatabase | undefined

/**
 * The server's database, opened on first use at `serverConfig().dbPath`. The
 * path lives under `.data/`, a bind-mounted volume in production and a plain
 * gitignored dir in dev, so the image stays immutable while the data survives
 * redeploys.
 */
export function useDatabase(): SqliteDatabase {
  instance ??= openDatabase(serverConfig())
  return instance
}

/** The stores of the server's database: the one way the server reads and writes rows. */
export function useStores(): Stores {
  return useDatabase().stores
}
