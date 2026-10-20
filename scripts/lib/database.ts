import type { DatabaseConfig } from '../../layers/studio/server/db/config.ts'
import process from 'node:process'
import { readDatabaseConfig } from '../../layers/studio/server/db/config.ts'

/**
 * The database a script opens: the one the environment names, as for the
 * server, or the SQLite file that `--db=<path>` gives.
 */
export function scriptDatabaseConfig(args: string[], env: Record<string, string | undefined> = process.env): DatabaseConfig {
  const file = args.find(a => a.startsWith('--db='))?.slice(5)
  return readDatabaseConfig(file ? { ...env, NUXT_DATABASE_DRIVER: 'sqlite', NUXT_DB_PATH: file } : env)
}
