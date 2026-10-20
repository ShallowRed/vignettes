import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import Database from 'better-sqlite3'
import { sql } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { migrateSqlite, MIGRATIONS_DIR as REPOSITORY_MIGRATIONS } from '../../layers/studio/server/db/sqlite/index'
import { freshSqlite } from './helpers/adapters'

const MIGRATIONS_DIR = join(process.cwd(), REPOSITORY_MIGRATIONS)

// freshSqlite() applies the chain with drizzle's journal-based migrate(), the same
// mechanism as the boot plugin, so a non-idempotent migration (the classic
// deploy breaker) is caught here rather than on the next production boot.

describe('database migrations', () => {
  it('apply cleanly from an empty database', () => {
    const db = freshSqlite()
    const columns = db.all<{ name: string }>(sql`PRAGMA table_info(decks)`).map(c => c.name)
    // 0009 is the latest migration; its column proves the chain ran to the end.
    expect(columns).toContain('deleted_at')
  })

  it('are idempotent: re-running migrate() is a no-op', () => {
    const db = freshSqlite()
    // Second pass over the same database must not re-run or throw.
    expect(() => migrateSqlite(db)).not.toThrow()
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

describe('boot migration plugin', () => {
  it('throws while Nitro starts when a migration fails, which stops the server', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'slides-boot-'))
    const path = join(dir, 'broken.db')
    // The first migration creates `decks`: a table already there makes it fail.
    const sqlite = new Database(path)
    sqlite.exec('CREATE TABLE decks (slug text)')
    sqlite.close()
    vi.stubEnv('NUXT_DB_PATH', path)
    vi.stubGlobal('defineNitroPlugin', (plugin: unknown) => plugin)
    try {
      const { default: plugin } = await import('../../layers/studio/server/plugins/migrations')
      expect(() => plugin({} as any)).toThrow(/Failed to run the query/)
    }
    finally {
      vi.unstubAllEnvs()
      vi.unstubAllGlobals()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
