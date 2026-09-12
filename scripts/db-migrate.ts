/**
 * Apply the migrations to the database the way the boot plugin does, for
 * scripts that run before any server started (a fresh worktree, an import).
 *
 *   node scripts/db-migrate.ts            # .data/slides.db (or NUXT_DB_PATH)
 */
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'

const path = process.env.NUXT_DB_PATH || '.data/slides.db'
mkdirSync(dirname(path), { recursive: true })
migrate(drizzle(new Database(path)), { migrationsFolder: join(process.cwd(), 'layers/studio/server/db/migrations') })
console.log(`migrations appliquées sur ${path}`)
