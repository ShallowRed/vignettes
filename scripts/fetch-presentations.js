/**
 * Initializes the presentations content during CI builds. Locally it's a git
 * submodule; in CI this clones the private repo into presentations/ using
 * PRESENTATIONS_REPO_TOKEN. readContentSourceConfig/decideFetchAction make the
 * fail-closed policy an explicit tested decision — shipping an empty
 * presentations/ is refused loudly rather than silently deployed.
 */

import { execSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { decideFetchAction, readContentSourceConfig } from '../shared/content/source-config.ts'

const PRESENTATIONS_DIR = join(process.cwd(), 'presentations')

/** Is the content already checked out locally (submodule populated)? */
function isPopulated() {
  const publicDir = join(PRESENTATIONS_DIR, 'public')
  if (!existsSync(publicDir))
    return false
  return readdirSync(publicDir).some(f => f.endsWith('.md'))
}

async function fetchPresentations() {
  const config = readContentSourceConfig()
  const decision = decideFetchAction(config, isPopulated())

  switch (decision.action) {
    case 'skip':
      console.log(`✅ Presentations: ${decision.reason} — skipping fetch`)
      return

    case 'fail':
      console.error(`❌ ${decision.reason}`)
      console.error('   Set PRESENTATIONS_REPO_TOKEN in the CI environment.')
      process.exit(1)
      return

    case 'clone':
      console.log(`📥 Cloning ${decision.repo}@${decision.branch} into presentations/...`)
      try {
        const cloneUrl = `https://x-access-token:${process.env.PRESENTATIONS_REPO_TOKEN}@github.com/${decision.repo}.git`
        execSync(`rm -rf "${PRESENTATIONS_DIR}"`, { stdio: 'inherit' })
        execSync(
          `git clone --depth 1 --branch ${decision.branch} ${cloneUrl} "${PRESENTATIONS_DIR}"`,
          { stdio: 'inherit' },
        )
        // Drop .git from the clone so Nuxt doesn't treat presentations/ as a repo.
        execSync(`rm -rf "${join(PRESENTATIONS_DIR, '.git')}"`, { stdio: 'inherit' })
        console.log('✨ Presentations fetched successfully!')
      }
      catch (error) {
        console.error('❌ Failed to fetch presentations:', error.message)
        if (config.failClosed) {
          console.error('   Likely an expired/invalid PRESENTATIONS_REPO_TOKEN. Rotate it in Infisical.')
          console.error('   Refusing to deploy a site without its presentations.')
          process.exit(1)
        }
        console.log('   Continuing build without private content...')
      }
  }
}

fetchPresentations()
