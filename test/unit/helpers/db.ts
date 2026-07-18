import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'

const MIGRATIONS_DIR = join(process.cwd(), 'server/db/migrations')

/** In-memory database with the real migrations applied (FK enforcement on). */
export function freshDb() {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  for (const file of readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort())
    sqlite.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf-8').replaceAll('--> statement-breakpoint', ''))
  return drizzle(sqlite)
}
