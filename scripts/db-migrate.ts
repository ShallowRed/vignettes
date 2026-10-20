/**
 * Apply the schema migrations to the database the way the boot plugin does, for
 * scripts that run before any server started (a fresh worktree, an import). The
 * data migrations wait for the first boot.
 *
 *   node scripts/db-migrate.ts            # .data/slides.db (or NUXT_DB_PATH)
 */
import process from 'node:process'
import { readDatabaseConfig } from '../layers/studio/server/db/config.ts'
import { openDatabase } from '../layers/studio/server/db/open.ts'

const config = readDatabaseConfig(process.env)
await openDatabase(config).migrateSchema()
console.log(`migrations appliquées sur ${config.dbPath}`)
