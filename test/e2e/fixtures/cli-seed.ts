/**
 * Seeds the accounts, the folder and the tokens of test/e2e/cli.e2e.ts in the
 * database of a server of playwright.config.ts, before the server starts: an
 * owner, a collaborator of the role viewer with an editor grant on the folder
 * `cli`, and a token of the scope write per case of `CLI_CASES`. Each secret is
 * drawn at random at each run and written beside the database, in a file only
 * the account of the run can read; the database keeps its SHA-256, as
 * `hashToken` does.
 *
 *   NUXT_PGLITE_DIR=.data/e2e-pglite node test/e2e/fixtures/cli-seed.ts
 *
 * Refuses any database but a PGlite directory `.data/e2e-*` of the repository.
 */

import type { SeededToken } from './cli-cases.ts'
import { randomBytes } from 'node:crypto'
import { lstatSync, writeFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { sha256Hex } from '@vignettes/core/digest'
import { describeDatabase } from '../../../layers/studio/server/db/config.ts'
import { openDatabaseFile } from '../../../layers/studio/server/db/open.ts'
import { scriptDatabaseConfig } from '../../../scripts/lib/database.ts'
import { CLI_ACCOUNTS, CLI_CASES, CLI_FOLDER, tokensFile } from './cli-cases.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

const config = scriptDatabaseConfig(process.argv.slice(2))
const directory = config.driver === 'pglite' ? resolve(ROOT, config.dir) : undefined
// A symbolic link at .data/e2e-* could lead to any database.
const isLink = (path: string) => lstatSync(path, { throwIfNoEntry: false })?.isSymbolicLink() ?? false
if (!directory || dirname(directory) !== resolve(ROOT, '.data') || !basename(directory).startsWith('e2e-') || isLink(directory)) {
  console.error(`cli-seed: ${describeDatabase(config)} is not a PGlite directory .data/e2e-* of the repository; the script writes the tokens of the tests in no other database.`)
  process.exit(1)
}
const file = tokensFile(directory)

async function seed() {
  // The directory checked above, whatever the current directory.
  const database = await openDatabaseFile({ ...config, dir: directory }, { readonly: false })
  try {
    const { users, projects, projectGrants, tokens } = database.stores
    for (const { id, login, role } of Object.values(CLI_ACCOUNTS))
      await users.upsertOnLogin({ id, login }, role)
    if (!await projects.slugExists(CLI_FOLDER))
      await projects.create({ title: 'Command line', slug: CLI_FOLDER })
    await projectGrants.set(CLI_FOLDER, CLI_ACCOUNTS.collaborator.id, 'editor', CLI_ACCOUNTS.owner.login)

    const now = new Date()
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    const seeded: Record<string, SeededToken> = {}
    for (const [name, account] of Object.entries(CLI_CASES)) {
      const secret = `vgt_${randomBytes(32).toString('base64url')}`
      await tokens.create(CLI_ACCOUNTS[account].id, { name: `e2e ${name}`, scope: 'write', tokenHash: await sha256Hex(new TextEncoder().encode(secret)), prefix: secret.slice(0, 12), expiresAt }, now)
      seeded[name] = { account, secret }
    }
    writeFileSync(file, `${JSON.stringify(seeded)}\n`, { mode: 0o600, flag: 'w' })
    console.log(`cli-seed: ${Object.keys(seeded).length} tokens in ${describeDatabase(config)}`)
  }
  finally {
    await database.close()
  }
}

seed().catch((error) => {
  console.error(error)
  process.exit(1)
})
