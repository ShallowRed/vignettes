/**
 * Apply the schema migrations to the database the way the boot plugin does, for
 * scripts that run before any server started (a fresh worktree, an import). The
 * data migrations wait for the first boot.
 *
 *   node scripts/db-migrate.ts            # the database of the environment (.data/pglite by default)
 */
import process from 'node:process'
import { describeDatabase, readDatabaseConfig } from '../layers/studio/server/db/config.ts'
import { openDatabase } from '../layers/studio/server/db/open.ts'

const config = readDatabaseConfig(process.env)
const database = await openDatabase(config)
await database.migrateSchema()
await database.close()
console.log(`migrations appliquées sur ${describeDatabase(config)}`)
