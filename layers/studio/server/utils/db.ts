import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema'
import { serverConfig } from './config'

let instance: ReturnType<typeof drizzle<typeof schema>> | undefined

/**
 * Lazy SQLite handle (WAL for concurrent reads during writes). The path lives
 * under `.data/` — a bind-mounted volume in production, plain gitignored dir in
 * dev — so the image stays immutable while the data survives redeploys.
 */
export function useDb() {
  if (!instance) {
    const path = serverConfig().dbPath
    mkdirSync(dirname(path), { recursive: true })
    const sqlite = new Database(path)
    sqlite.pragma('journal_mode = WAL')
    sqlite.pragma('foreign_keys = ON')
    instance = drizzle(sqlite, { schema })
  }
  return instance
}
