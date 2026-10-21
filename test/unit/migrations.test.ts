import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { PGlite } from '@electric-sql/pglite'
import Database from 'better-sqlite3'
import { sql } from 'drizzle-orm'
import { migrate as migrateSqliteFolder } from 'drizzle-orm/better-sqlite3/migrator'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate as migratePgliteFolder } from 'drizzle-orm/pglite/migrator'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPostgresStores, openPglite, MIGRATIONS_DIR as POSTGRES_MIGRATIONS } from '../../layers/studio/server/db/postgres/index'
import * as pgSchema from '../../layers/studio/server/db/postgres/schema'
import { createSqliteStores, migrateSqlite, openSqlite, MIGRATIONS_DIR as REPOSITORY_MIGRATIONS } from '../../layers/studio/server/db/sqlite/index'
import { freshSqlite, PGLITE_TIMEOUT, postgresRows, seedDeck, seedUser, sqliteRows } from './helpers/adapters'

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

  it('refuse a database that holds a row whose foreign key names no row', () => {
    const db = freshSqlite()
    db.$client.pragma('foreign_keys = OFF')
    db.$client.prepare(`INSERT INTO deck_permissions (deck_slug, user_id, role, granted_by, created_at) VALUES ('gone', 7, 'viewer', 'boss', 0)`).run()
    expect(() => migrateSqlite(db)).toThrow(/^The database holds foreign keys that name no row \(2\), the first in deck_permissions, parent \w+, before the migrations$/)
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

/** A copy of a migrations folder that stops before `tag`, the folder of an instance that has not taken it yet. */
function migrationsBefore(folder: string, tag: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'slides-migrations-'))
  const journal = JSON.parse(readFileSync(join(folder, 'meta/_journal.json'), 'utf-8')) as { entries: { tag: string }[] }
  journal.entries = journal.entries.filter(entry => entry.tag < tag)
  mkdirSync(join(dir, 'meta'))
  writeFileSync(join(dir, 'meta/_journal.json'), JSON.stringify(journal))
  for (const entry of journal.entries)
    copyFileSync(join(folder, `${entry.tag}.sql`), join(dir, `${entry.tag}.sql`))
  return dir
}

describe('the account ids on a populated database', () => {
  const carol = { provider: 'google' as const, providerId: 'sub-carol', login: 'carol@example.com' }

  it('0019 of SQLite keeps the accounts and their grants, and gives no id twice', async () => {
    const db = openSqlite(':memory:')
    const before = migrationsBefore(MIGRATIONS_DIR, '0019')
    migrateSqliteFolder(db, { migrationsFolder: before })
    rmSync(before, { recursive: true })
    const stores = createSqliteStores(db)
    await seedUser(sqliteRows(db), 101, 'alice')
    await seedUser(sqliteRows(db), 202, 'bob')
    await seedDeck(sqliteRows(db), 'deck')
    await stores.deckGrants.set('deck', 202, 'editor', 'alice')

    // The rebuild drops `users` while `deck_permissions` names it.
    migrateSqlite(db)

    expect(db.$client.pragma('foreign_keys', { simple: true })).toBe(1)
    expect((await stores.users.list()).map(account => account.id)).toEqual([101, 202])
    expect((await stores.deckGrants.listForDeck('deck')).map(grant => grant.userId)).toEqual([202])
    await stores.users.remove(202)
    await expect(stores.users.upsertOAuthLogin(carol, 'viewer')).resolves.toMatchObject({ id: 203 })
    db.$client.close()
  })

  it('0001 of PostgreSQL starts the sequence past the existing ids', async () => {
    const client = await PGlite.create()
    const db = drizzle({ client, schema: pgSchema })
    const folder = join(process.cwd(), POSTGRES_MIGRATIONS)
    const before = migrationsBefore(folder, '0001')
    await migratePgliteFolder(db, { migrationsFolder: before })
    rmSync(before, { recursive: true })
    await seedUser(postgresRows(db), 101, 'alice')

    await migratePgliteFolder(db, { migrationsFolder: folder })

    const users = createPostgresStores(db).users
    await users.upsertOnLogin({ id: 50, login: 'dev-owner' }, 'owner')
    const { id } = await users.upsertOAuthLogin(carol, 'viewer')
    expect(id).toBeGreaterThan(101)
    await client.close()
  }, PGLITE_TIMEOUT)
})

/** The Nitro app a plugin receives, reduced to the hooks it registers. */
function fakeNitroApp() {
  const hooks = new Map<string, () => unknown>()
  return {
    app: { hooks: { hook: (name: string, fn: () => unknown) => hooks.set(name, fn) } } as any,
    call: (name: string) => hooks.get(name)!(),
  }
}

/**
 * Each driver of the boot tests: the environment that selects it in `dir`, and
 * a database there whose first migration fails, since `decks` exists already.
 */
const BOOT_DRIVERS = [
  {
    name: 'sqlite',
    timeout: 10_000,
    env: (dir: string) => ({ NUXT_DATABASE_DRIVER: 'sqlite', NUXT_DB_PATH: join(dir, 'slides.db') }),
    async break(dir: string) {
      const sqlite = new Database(join(dir, 'slides.db'))
      sqlite.exec('CREATE TABLE decks (slug text)')
      sqlite.close()
    },
  },
  {
    name: 'pglite',
    timeout: PGLITE_TIMEOUT,
    env: (dir: string) => ({ NUXT_DATABASE_DRIVER: '', NUXT_DATABASE_URL: '', NUXT_PGLITE_DIR: join(dir, 'pglite') }),
    async break(dir: string) {
      const connection = await openPglite(join(dir, 'pglite'))
      await connection.db.execute(sql`CREATE TABLE decks (slug text)`)
      await connection.close()
    },
  },
]

describe.each(BOOT_DRIVERS)('boot migration plugin ($name)', (driver) => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'slides-boot-'))
    for (const [name, value] of Object.entries(driver.env(dir)))
      vi.stubEnv(name, value)
    vi.stubGlobal('defineNitroPlugin', (plugin: unknown) => plugin)
  })

  afterEach(async () => {
    const { closeDatabase } = await import('../../layers/studio/server/utils/db')
    await closeDatabase()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    rmSync(dir, { recursive: true, force: true })
  }, driver.timeout)

  it('holds the requests until the migrations end', async () => {
    const { default: plugin } = await import('../../layers/studio/server/plugins/migrations')
    const { useStores } = await import('../../layers/studio/server/utils/db')
    const nitro = fakeNitroApp()

    plugin(nitro.app)
    expect(() => useStores()).toThrow(/not ready/)
    await nitro.call('request')
    await expect(useStores().deckMeta.listManaged()).resolves.toEqual([])
  }, driver.timeout)

  it('stops the process when a migration fails', async () => {
    await driver.break(dir)
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { default: plugin } = await import('../../layers/studio/server/plugins/migrations')
    const nitro = fakeNitroApp()

    plugin(nitro.app)
    await nitro.call('request')
    expect(exit).toHaveBeenCalledWith(1)
  }, driver.timeout)
})

describe('the migration lock of PostgreSQL', () => {
  let connection: Awaited<ReturnType<typeof openPglite>>
  const advisoryLocks = async () => {
    const result = await connection.db.execute(sql`select count(*)::int as n from pg_locks where locktype = 'advisory'`)
    return (result as unknown as { rows: { n: number }[] }).rows[0]!.n
  }

  beforeAll(async () => {
    connection = await openPglite()
  }, PGLITE_TIMEOUT)

  afterAll(() => connection.close(), PGLITE_TIMEOUT)

  it('holds an advisory lock while the work runs, and releases it after a failure', async () => {
    await expect(connection.exclusive(advisoryLocks)).resolves.toBe(1)
    expect(await advisoryLocks()).toBe(0)
    await expect(connection.exclusive(async () => {
      throw new Error('migration failed')
    })).rejects.toThrow('migration failed')
    expect(await advisoryLocks()).toBe(0)
  })
})
