import { join } from 'node:path'
import process from 'node:process'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { decks, users } from '../../../server/db/schema'

export const MIGRATIONS_DIR = join(process.cwd(), 'server/db/migrations')

/** A fixed clock for rows whose timestamps do not matter to the test. */
export const NOW = new Date(1700000000000)

/**
 * In-memory database with the real migrations applied through drizzle's
 * journal-based `migrate()` (the same mechanism as the boot plugin), FK
 * enforcement on.
 */
export function freshDb() {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite)
  migrate(db, { migrationsFolder: MIGRATIONS_DIR })
  return db
}

type Db = ReturnType<typeof freshDb>

/** A raw deck row (bypasses the stores) for tests about the rows themselves. */
export function seedDeck(db: Db, slug: string, over: Partial<typeof decks.$inferInsert> = {}) {
  db.insert(decks).values({ slug, title: slug, createdAt: NOW, updatedAt: NOW, ...over }).run()
}

/** A raw user row; `providerId` defaults to the id so the identity index stays unique. */
export function seedUser(db: Db, id: number, login: string, over: Partial<typeof users.$inferInsert> = {}) {
  db.insert(users).values({ id, login, providerId: String(id), createdAt: NOW, lastLoginAt: NOW, ...over }).run()
}
