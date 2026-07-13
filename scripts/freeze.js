/**
 * Declarative driver for the deck-freeze pipeline: reads the registry entry,
 * builds a descriptor (buildFreezeDescriptor, the single source of all derived
 * values), prints the plan under --dry-run, else runs the enabled steps. Each
 * step delegates to the existing Makefile targets — this script decides only the
 * *what*, the Makefile stays the source of the *how*.
 *
 * Usage: node scripts/freeze.js <alias> [--dry-run] [--no-pull] [--theme <t>]
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { load as parseYaml } from 'js-yaml'
import { buildFreezeDescriptor } from '../shared/build/freeze.ts'

const args = process.argv.slice(2)
const alias = args.find(a => !a.startsWith('--'))
const dryRun = args.includes('--dry-run')
const noPull = args.includes('--no-pull')
const themeOverride = argVal('--theme')

function argVal(flag) {
  const i = args.indexOf(flag)
  return i !== -1 ? args[i + 1] : undefined
}

if (!alias) {
  console.error('Usage: node scripts/freeze.js <alias> [--dry-run] [--no-pull] [--theme <t>]')
  process.exit(1)
}

const ROOT = process.cwd()
const registryPath = join(ROOT, 'presentations', 'registry.yml')
if (!existsSync(registryPath)) {
  console.error(`❌ Registry not found: ${registryPath}`)
  process.exit(1)
}

const registry = parseYaml(readFileSync(registryPath, 'utf-8')) || {}
const entry = registry[alias]
if (!entry) {
  console.error(`❌ Alias "${alias}" not in registry.`)
  process.exit(1)
}

// Theme comes from the stub frontmatter (DDR-018); reuse registry-get.js so
// there is one definition of "the deck's theme".
const theme = themeOverride || resolveTheme(alias)

const descriptor = buildFreezeDescriptor({ ...entry, alias }, { theme })

if (noPull)
  setStep('pull-note', false)

printPlan(descriptor, { dryRun, noPull })

if (dryRun) {
  console.log('\n(dry run — nothing executed)')
  process.exit(0)
}

for (const step of descriptor.steps.filter(s => s.enabled)) {
  console.log(`\n▶  ${step.id} — ${step.description}`)
  runStep(step.id, descriptor)
}

console.log(`\n✅ Freeze plan executed for "${alias}".`)
console.log(`   Served at ${descriptor.servedUrl}`)

function resolveTheme(aliasArg) {
  try {
    return execFileSync('node', ['scripts/registry-get.js', aliasArg, 'theme'], {
      cwd: ROOT,
      encoding: 'utf-8',
    }).trim() || undefined
  }
  catch {
    return undefined // descriptor falls back to DEFAULT_FREEZE_THEME
  }
}

function setStep(id, enabled) {
  const step = descriptor.steps.find(s => s.id === id)
  if (step)
    step.enabled = enabled
}

function printPlan(d, { dryRun: dry, noPull: skipPull }) {
  console.log(`Freeze plan for "${d.alias}"${dry ? ' (dry run)' : ''}`)
  console.log(`  slug            ${d.slug}`)
  console.log(`  theme           ${d.theme}`)
  console.log(`  standaloneSlug  ${d.standaloneSlug}`)
  console.log(`  frozenBaseUrl   ${d.frozenBaseUrl}`)
  console.log(`  bundleOut       ${d.bundleOut}`)
  console.log(`  hostDir         ${d.hostDir}`)
  console.log(`  servedUrl       ${d.servedUrl}`)
  console.log(`  collaborative   ${d.isCollaborative}${skipPull ? ' (pull skipped: --no-pull)' : ''}`)
  console.log('  steps:')
  for (const step of d.steps)
    console.log(`    [${step.enabled ? 'x' : ' '}] ${step.id} — ${step.description}`)
}

function runStep(id, d) {
  switch (id) {
    case 'pull-note':
      make('pull-note', { ALIAS: d.alias })
      break
    case 'bundle-frozen':
      make('bundle-frozen', {
        BUNDLE_SLUG: d.slug,
        BUNDLE_THEME: d.theme,
        FROZEN_BASE_URL: d.frozenBaseUrl,
      })
      break
    case 'host-frozen':
      make('host-frozen', { ALIAS: d.alias })
      break
    case 'flip-lifecycle':
      // Reminder only — flipping `lifecycle: frozen` is a reviewed registry edit, never automatic.
      console.log(`   → Set 'lifecycle: frozen' (+ frozenBundle: ${d.alias}) for "${d.alias}" in presentations/registry.yml`)
      console.log(`   /p/${d.alias} then redirects to ${d.frozenBaseUrl} — CodiMD no longer needed, URL unchanged.`)
      break
    default:
      throw new Error(`Unknown freeze step: ${id}`)
  }
}

function make(target, vars) {
  const assignments = Object.entries(vars).map(([k, v]) => `${k}=${v}`)
  execFileSync('make', ['--no-print-directory', target, ...assignments], {
    cwd: ROOT,
    stdio: 'inherit',
  })
}
