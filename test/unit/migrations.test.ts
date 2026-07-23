import { join } from 'node:path'
import process from 'node:process'
import Database from 'better-sqlite3'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { describe, expect, it } from 'vitest'

// The boot plugin applies migrations with drizzle's real journal-based migrate(),
// not the raw-SQL replay the other tests use via freshDb(). Exercise that exact
// mechanism so a non-idempotent migration (the classic deploy breaker) is caught
// here rather than on the next production boot.
const MIGRATIONS_FOLDER = join(process.cwd(), 'server/db/migrations')

function migratedDb() {
  const db = drizzle(new Database(':memory:'))
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
  return db
}

describe('database migrations', () => {
  it('apply cleanly from an empty database', () => {
    const db = migratedDb()
    const columns = db.all<{ name: string }>(sql`PRAGMA table_info(decks)`).map(c => c.name)
    // 0009 is the latest migration; its column proves the chain ran to the end.
    expect(columns).toContain('deleted_at')
  })

  it('are idempotent: re-running migrate() is a no-op', () => {
    const db = migratedDb()
    // Second pass over the same database must not re-run or throw.
    expect(() => migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })).not.toThrow()
  })
})
