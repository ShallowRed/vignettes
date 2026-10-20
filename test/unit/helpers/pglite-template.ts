import type { TestProject } from 'vitest/node'
import { Buffer } from 'node:buffer'
import { rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { MIGRATIONS_DIR } from '../../../layers/studio/server/db/postgres/index'

declare module 'vitest' {
  export interface ProvidedContext {
    /** A dump of a migrated, empty PGlite database, which each contract suite loads. */
    pgliteTemplate: string
  }
}

/**
 * Global setup: migrates one PGlite database for the whole run and dumps it.
 * Each suite loads that dump.
 */
export default async function setup(project: TestProject) {
  const client = await PGlite.create()
  await migrate(drizzle({ client }), { migrationsFolder: MIGRATIONS_DIR })
  const dump = await client.dumpDataDir('none')
  await client.close()
  const path = join(tmpdir(), `vignettes-pglite-${process.pid}.tar`)
  writeFileSync(path, Buffer.from(await dump.arrayBuffer()))
  project.provide('pgliteTemplate', path)
  return () => rmSync(path, { force: true })
}
