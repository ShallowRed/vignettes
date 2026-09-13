import { existsSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { runDataMigrations } from '../db/data-migrations'
import { useDb } from '../utils/db'

/**
 * Apply pending migrations at boot: dev reads the repo folder, prod the copy
 * shipped in the output. The data migrations follow, once the schema is current.
 */
export default defineNitroPlugin(() => {
  const candidates = [
    join(process.cwd(), 'layers/studio/server/db/migrations'),
    join(process.cwd(), '.output/server/migrations'),
  ]
  const migrationsFolder = candidates.find(existsSync)
  if (!migrationsFolder)
    throw new Error('No migrations folder found (looked in layers/studio/server/db/migrations and .output/server/migrations)')
  migrate(useDb(), { migrationsFolder })
  runDataMigrations(useDb())
})
