#!/usr/bin/env node
/**
 * Freeze a published deck into a static bundle and upload it.
 *
 * The deck, its alias and its bundle name come from the local database. A deck
 * that embeds Storybook stories needs
 * `--storybook <built-dir>`: that Storybook is copied into the bundle so the
 * embeds keep rendering.
 *
 * Usage: node scripts/freeze.ts <alias> [--storybook <dir>] [--theme <name>]
 *                               [--dry-run] [--no-upload] [--db <path>]
 */
import type { FreezeDescriptor } from '@vignettes/freeze'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { splitFrontmatter } from '@vignettes/core/deck'
import { resolveThemeName, setThemeRegistry } from '@vignettes/core/theme'
import { buildFreezeDescriptor, freezeDeck } from '@vignettes/freeze'
import { discoverThemes, registryOf } from '@vignettes/nuxt/build/theme-registry'
import { readDatabaseConfig } from '../layers/studio/server/db/config.ts'
import { openDatabaseFile } from '../layers/studio/server/db/open.ts'

const root = import.meta.dirname ? join(import.meta.dirname, '..') : process.cwd()
const args = process.argv.slice(2)
const alias = args.find(a => !a.startsWith('--'))
const dryRun = args.includes('--dry-run')
const noUpload = args.includes('--no-upload')
const storybookDir = argValue('--storybook')
const themeOverride = argValue('--theme')
// A NUXT_DB_PATH names its file from the current directory; the default one is in the repository.
const dbPath = argValue('--db') ?? (process.env.NUXT_DB_PATH ? readDatabaseConfig(process.env).dbPath : join(root, readDatabaseConfig({}).dbPath))

function argValue(flag: string): string | undefined {
  const i = args.indexOf(flag)
  return i !== -1 ? args[i + 1] : undefined
}

if (!alias) {
  console.error('Usage: node scripts/freeze.ts <alias> [--storybook <dir>] [--theme <name>] [--dry-run] [--no-upload]')
  process.exit(2)
}

const { archive } = openDatabaseFile({ dbPath }, { readonly: true }).stores
const decks = await archive.decks()
// The alias is the canonical one of a deck, a historical one, or the slug itself.
const historical = (await archive.aliases()).find(row => row.alias === alias)
const target = decks.find(row => row.alias === alias || row.slug === alias)
  ?? decks.find(row => row.slug === historical?.slug)
if (!target)
  fail(`no deck answers to "${alias}" in ${dbPath}`)
const entry = { slug: target.slug, frozenBundle: target.frozenBundle ?? undefined }

const slug = entry.slug
const served = decks.find(row => row.slug === slug && !row.trashed)
const deck = served?.raw != null ? { theme: served.theme, raw: served.raw } : undefined
if (!deck)
  fail(`deck "${slug}" has no published version in ${dbPath}`)

const frontmatter = splitFrontmatter(deck.raw).data as { theme?: string, storybook?: string }
// The bundle links one stylesheet and has no runtime to resolve aliases, so the
// theme name is resolved here: a deck on `dsfr` aliased to a brand freezes with
// the brand, exactly as the live deck renders.
setThemeRegistry(registryOf(discoverThemes(root)))
const theme = resolveThemeName(themeOverride ?? deck.theme ?? frontmatter.theme)
const descriptor = buildFreezeDescriptor({ ...entry, alias }, { theme, storybookDir })

if (frontmatter.storybook && !storybookDir) {
  console.warn(`⚠ the deck embeds Storybook stories (${frontmatter.storybook}) but no --storybook <dir> was given:`)
  console.warn('  the bundle would carry dead iframes. Build that Storybook first, or freeze another deck.')
}
if (storybookDir && !existsSync(join(root, storybookDir)) && !existsSync(storybookDir))
  fail(`Storybook build not found: ${storybookDir}`)

printPlan(descriptor)
if (dryRun) {
  console.log('\n(dry run: nothing executed)')
  process.exit(0)
}

freezeDeck({
  root,
  descriptor,
  raw: deck.raw,
  storybookDir,
  contentDir: process.env.NUXT_CONTENT_DIR,
  build: { command: 'pnpm', args: ['generate'] },
  deckPath: slug => join('slides', slug),
  env: { NUXT_DB_PATH: dbPath },
  provenance: { storybook: frontmatter.storybook ?? null, gitCommit: gitCommit() },
  upload: noUpload
    ? undefined
    : (bundle, dir) => execFileSync('node', ['scripts/upload-frozen.js', bundle, '--dir', dir], { cwd: root, stdio: 'inherit' }),
})

if (noUpload)
  console.log(`   publish later with: mise run freeze:push -- ${descriptor.bundle}`)

console.log(`\n▶ flip-lifecycle: set lifecycle "frozen" and frozenBundle "${descriptor.bundle}" on "${slug}" (PATCH /api/admin/decks/${slug}),`)
console.log(`  so /p/${descriptor.alias} redirects to ${descriptor.servedUrl}`)
console.log(`\n✓ ${descriptor.alias} frozen, served at ${descriptor.servedUrl}`)

function gitCommit(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  }
  catch {
    return 'unknown'
  }
}

function printPlan(d: FreezeDescriptor) {
  console.log(`Freeze "${d.alias}"${dryRun ? ' (dry run)' : ''}`)
  console.log(`  deck       ${d.slug}${d.theme ? ` (theme ${d.theme})` : ''}`)
  console.log(`  bundle     ${d.hostDir} → frozen/${d.bundle}/`)
  console.log(`  served at  ${d.servedUrl}`)
  console.log(`  storybook  ${storybookDir ?? (frontmatter.storybook ? 'MISSING (--storybook)' : 'none')}`)
  for (const s of d.steps)
    console.log(`    [${s.enabled ? 'x' : ' '}] ${s.id}`)
}

function fail(message: string): never {
  console.error(`✗ ${message}`)
  process.exit(1)
}
