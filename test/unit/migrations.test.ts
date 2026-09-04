import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { describe, expect, it } from 'vitest'
import { freshDb, MIGRATIONS_DIR } from './helpers/db'

// freshDb() applies the chain with drizzle's journal-based migrate(), the same
// mechanism as the boot plugin, so a non-idempotent migration (the classic
// deploy breaker) is caught here rather than on the next production boot.

describe('database migrations', () => {
  it('apply cleanly from an empty database', () => {
    const db = freshDb()
    const columns = db.all<{ name: string }>(sql`PRAGMA table_info(decks)`).map(c => c.name)
    // 0009 is the latest migration; its column proves the chain ran to the end.
    expect(columns).toContain('deleted_at')
  })

  it('are idempotent: re-running migrate() is a no-op', () => {
    const db = freshDb()
    // Second pass over the same database must not re-run or throw.
    expect(() => migrate(db, { migrationsFolder: MIGRATIONS_DIR })).not.toThrow()
  })

  it('0010 backfills provider identity on a populated database', () => {
    // The production shape: users exist BEFORE 0010 runs. Without the backfill,
    // every row would share ('github', '') and the unique index would refuse to
    // build — an empty-database run cannot catch that.
    const sqlite = new Database(':memory:')
    const files = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort()
    for (const file of files.filter(f => f < '0010'))
      sqlite.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf-8').replaceAll('--> statement-breakpoint', ''))

    const now = Date.now()
    const insert = sqlite.prepare('INSERT INTO users (id, login, role, created_at, last_login_at) VALUES (?, ?, ?, ?, ?)')
    insert.run(101, 'alice', 'owner', now, now)
    insert.run(202, 'bob', 'viewer', now, now)

    for (const file of files.filter(f => f >= '0010'))
      sqlite.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf-8').replaceAll('--> statement-breakpoint', ''))

    const rows = sqlite.prepare('SELECT id, provider, provider_id FROM users ORDER BY id').all() as
      { id: number, provider: string, provider_id: string }[]
    expect(rows).toEqual([
      { id: 101, provider: 'github', provider_id: '101' },
      { id: 202, provider: 'github', provider_id: '202' },
    ])
  })
})
