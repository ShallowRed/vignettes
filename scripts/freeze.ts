#!/usr/bin/env node
/**
 * Freeze a published deck into a self-contained static bundle: no server, no
 * database, no Nuxt runtime. The alias keeps serving the same URL, from the
 * bundle instead of the live deck, for as long as the link is out there.
 *
 * The deck comes from the local database (theme, Storybook base and markdown),
 * the alias from the content space's `registry.yml`. A deck that embeds
 * Storybook stories needs `--storybook <built-dir>`: that Storybook is copied
 * into the bundle so the embeds keep rendering without the design system's
 * server.
 *
 * Usage: node scripts/freeze.ts <alias> [--storybook <dir>] [--theme <name>]
 *                               [--dry-run] [--no-upload] [--db <path>]
 */
import type { FreezeDescriptor } from '../shared/build/freeze.ts'
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import Database from 'better-sqlite3'
import { load as parseYaml } from 'js-yaml'
import { bundleStorybookUrl } from '../shared/build/bundle.ts'
import { buildFreezeDescriptor } from '../shared/build/freeze.ts'
import { splitFrontmatter } from '../shared/deck/frontmatter.ts'
import { resolveThemeName, setThemeRegistry } from '../shared/theme/tokens.ts'
import { buildReducedPublic, copyDeckAssets, rebaseCssUrls } from './lib/bundle-assets.ts'
import { contentDir, discoverThemes, registryOf } from './lib/theme-registry.ts'

const root = import.meta.dirname ? join(import.meta.dirname, '..') : process.cwd()
const args = process.argv.slice(2)
const alias = args.find(a => !a.startsWith('--'))
const dryRun = args.includes('--dry-run')
const noUpload = args.includes('--no-upload')
const storybookDir = argValue('--storybook')
const themeOverride = argValue('--theme')
const dbPath = argValue('--db') ?? process.env.NUXT_DB_PATH ?? join(root, '.data', 'slides.db')

function argValue(flag: string): string | undefined {
  const i = args.indexOf(flag)
  return i !== -1 ? args[i + 1] : undefined
}

if (!alias) {
  console.error('Usage: node scripts/freeze.ts <alias> [--storybook <dir>] [--theme <name>] [--dry-run] [--no-upload]')
  process.exit(2)
}

// --- the deck -------------------------------------------------------------

const registryPath = join(contentDir(root), 'registry.yml')
if (!existsSync(registryPath))
  fail(`registry not found: ${registryPath}`)
const registry = (parseYaml(readFileSync(registryPath, 'utf8')) ?? {}) as Record<string, { slug?: string, frozenBundle?: string }>
const entry = registry[alias]
if (!entry)
  fail(`alias "${alias}" is not in ${registryPath}`)

const db = new Database(dbPath, { readonly: true, fileMustExist: true })
const slug = entry.slug || alias
const deck = db.prepare(`
  select d.slug, d.theme, v.raw
  from decks d join deck_versions v on v.id = d.published_version_id
  where d.slug = ? and d.deleted_at is null
`).get(slug) as { slug: string, theme: string | null, raw: string } | undefined
if (!deck)
  fail(`deck "${slug}" has no published version in ${dbPath}`)

const frontmatter = splitFrontmatter(deck.raw).data as { theme?: string, storybook?: string }
// The bundle links one stylesheet with no runtime to resolve aliases, so the
// deck's theme name is resolved here: a deck on `dsfr` aliased to a brand
// freezes with the brand, exactly as the live deck renders.
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
  console.log('\n(dry run — nothing executed)')
  process.exit(0)
}

// --- build ----------------------------------------------------------------

const outDir = join(root, descriptor.hostDir)
const publicDir = mkdtempSync(join(tmpdir(), 'bundle-public-'))
try {
  step('build-bundle', () => {
    const kept = buildReducedPublic(root, publicDir, theme)
    console.log(`   reduced public/: ${kept.join(', ')}`)
    run('pnpm', ['generate'], {
      BUNDLE_ONLY_SLUG: descriptor.slug,
      BUNDLE_PUBLIC_DIR: publicDir,
      BUNDLE_THEME: theme ?? '',
      BUNDLE_STORYBOOK_URL: bundleStorybookUrl(descriptor.baseUrl),
      NUXT_APP_BASE_URL: descriptor.baseUrl,
      NUXT_DB_PATH: dbPath,
    })

    rmSync(outDir, { recursive: true, force: true })
    mkdirSync(outDir, { recursive: true })
    cpSync(join(root, '.output/public'), outDir, { recursive: true })
    // The deck page keeps the historical `--standalone` directory name, the path
    // `/p/<alias>` has been sending visitors to since the first frozen bundle.
    renameSync(join(outDir, 'slides', descriptor.slug), join(outDir, 'slides', descriptor.deckDir))

    // The deck is Reveal-only (noScripts): its Nuxt JS chunks are dead weight,
    // while the CSS chunks stay linked by link-deck-css.
    for (const file of listFiles(join(outDir, '_nuxt')).filter(f => f.endsWith('.js')))
      unlinkSync(file)
    rmSync(join(outDir, 'slides', descriptor.deckDir, '_payload.json'), { force: true })

    mkdirSync(join(outDir, 'reveal'), { recursive: true })
    for (const file of ['reveal.js', 'reveal.css'])
      cpSync(join(root, 'node_modules/reveal.js/dist', file), join(outDir, 'reveal', file))

    run('node', ['scripts/link-deck-css.js', outDir, descriptor.deckDir])

    const { copied, missing } = copyDeckAssets(root, deck!.raw, outDir, process.env.NUXT_CONTENT_DIR)
    console.log(`   deck assets: ${copied.length} carried${missing.length ? `, MISSING ${missing.join(', ')}` : ''}`)
    console.log(`   stylesheets made location-agnostic: ${rebaseCssUrls(outDir)}`)
  })

  step('embed-storybook', () => {
    const source = existsSync(storybookDir!) ? storybookDir! : join(root, storybookDir!)
    const target = join(outDir, '_storybook')
    cpSync(source, target, { recursive: true })
    run('node', ['scripts/prune-storybook-assets.js', target])
    run('node', ['scripts/rebase-storybook-assets.js', target])
  })

  step('host-bundle', () => {
    const sourceDir = join(outDir, 'source')
    mkdirSync(sourceDir, { recursive: true })
    writeFileSync(join(sourceDir, `${descriptor.slug}.md`), deck!.raw)
    writeFileSync(join(sourceDir, 'provenance.json'), `${JSON.stringify({
      alias: descriptor.alias,
      slug: descriptor.slug,
      theme: descriptor.theme ?? null,
      storybook: frontmatter.storybook ?? null,
      frozenAt: new Date().toISOString(),
      gitCommit: gitCommit(),
    }, null, 2)}\n`)
    console.log(`   ${outDir} (${listFiles(outDir).length} files)`)
  })

  step('upload-bundle', () => {
    if (noUpload) {
      console.log(`   skipped (--no-upload); publish later with: mise run freeze:push -- ${descriptor.bundle}`)
      return
    }
    run('node', ['scripts/upload-frozen.js', descriptor.bundle, '--dir', outDir])
  })

  step('flip-lifecycle', () => {
    console.log(`   → set 'lifecycle: frozen' (+ frozenBundle: ${descriptor.bundle}) for "${descriptor.alias}" in registry.yml,`)
    console.log(`     then republish the deck so /p/${descriptor.alias} redirects to ${descriptor.servedUrl}`)
  })

  console.log(`\n✓ ${descriptor.alias} frozen — served at ${descriptor.servedUrl}`)
}
finally {
  rmSync(publicDir, { recursive: true, force: true })
}

// --- helpers --------------------------------------------------------------

function step(id: FreezeDescriptor['steps'][number]['id'], body: () => void) {
  const s = descriptor.steps.find(x => x.id === id)!
  if (!s.enabled)
    return
  console.log(`\n▶ ${s.id} — ${s.description}`)
  body()
}

function run(cmd: string, argv: string[], env: Record<string, string> = {}) {
  execFileSync(cmd, argv, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } })
}

function listFiles(dir: string): string[] {
  if (!existsSync(dir))
    return []
  return readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? listFiles(join(dir, e.name)) : [join(dir, e.name)],
  )
}

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
