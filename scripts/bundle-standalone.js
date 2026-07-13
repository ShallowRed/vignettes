/**
 * Stages a self-contained static site where Storybook and the Nuxt presentation
 * share an origin, so iframe embeds work without a running Storybook dev server:
 * copies storybook-static/ into public/ and patches the deck's storybook: URL to
 * the bundled path. The caller runs `nuxt generate` between setup and teardown.
 *
 * Usage: node scripts/bundle-standalone.js <slug> <storybook-dir> [storybook-url]
 */

import { existsSync } from 'node:fs'
import { cp, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const [slug, storybookDir, storybookUrl = '/_storybook', , command = 'setup'] = process.argv.slice(2)

if (!slug || !storybookDir) {
  console.error('Usage: node scripts/bundle-standalone.js <slug> <storybook-dir> [storybook-url]')
  process.exit(1)
}

const srcPres = join(ROOT, 'presentations', 'public', `${slug}.md`)
const patchedPres = join(ROOT, 'presentations', 'public', `${slug}--standalone.md`)
const storybookDest = join(ROOT, 'presentations', 'public', '_storybook-bundle')

if (!existsSync(srcPres)) {
  console.error(`❌ Presentation not found: ${srcPres}`)
  process.exit(1)
}

if (!existsSync(storybookDir)) {
  console.error(`❌ Storybook build not found: ${storybookDir}`)
  process.exit(1)
}

async function setup() {
  console.log(`📦 Bundling standalone: ${slug}`)

  console.log(`  → Copying storybook from ${storybookDir}`)
  if (existsSync(storybookDest))
    await rm(storybookDest, { recursive: true })
  await cp(storybookDir, storybookDest, { recursive: true })

  console.log(`  → Patching presentation frontmatter`)
  const original = await readFile(srcPres, 'utf-8')
  const baseUrl = process.env.NUXT_APP_BASE_URL || '/'
  const resolvedStorybookUrl = baseUrl !== '/'
    ? baseUrl.replace(/\/$/, '') + storybookUrl
    : storybookUrl
  const patched = original.replace(
    /^(storybook:\s*)https?:\/\/[^\n]*/m,
    `$1${resolvedStorybookUrl}`,
  )
  if (patched === original) {
    console.warn('  ⚠️  No storybook: frontmatter found — presentation unchanged')
  }
  await writeFile(patchedPres, patched, 'utf-8')

  console.log(`  ✅ Setup done. Run nuxt generate then call teardown.`)
}

async function teardown() {
  console.log(`🧹 Teardown standalone bundle`)
  if (existsSync(patchedPres))
    await rm(patchedPres)
  if (existsSync(storybookDest))
    await rm(storybookDest, { recursive: true })
  console.log(`  ✅ Cleaned up temp files.`)
}

if (command === 'teardown')
  await teardown()
else
  await setup()
