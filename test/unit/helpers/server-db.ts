import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'

const MIGRATIONS = join(process.cwd(), 'server/db/migrations')

/**
 * Point the lazy `useDb()` singleton at a throwaway migrated file so server utils
 * that reach for `useDb()` (stores, guards) run against a real schema in a unit
 * test. Must run before the first `useDb()` call. Returns a cleanup that removes
 * the temp directory.
 */
export function useMigratedTestDb(): () => void {
  const dir = mkdtempSync(join(tmpdir(), 'slides-test-'))
  const path = join(dir, 'test.db')
  migrate(drizzle(new Database(path)), { migrationsFolder: MIGRATIONS })
  process.env.NUXT_DB_PATH = path
  return () => rmSync(dir, { recursive: true, force: true })
}
