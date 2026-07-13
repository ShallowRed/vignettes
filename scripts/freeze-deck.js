/**
 * Resolves which Storybook stories a deck embeds, so a freeze can bundle only
 * those instead of the whole storybook-static/. Cross-checks referenced ids
 * against the built index.json (Storybook owns id-generation, so reading the
 * built index stays correct across upgrades and detects broken refs for free).
 *
 * Usage: node scripts/freeze-deck.js <deck.md> <storybook-static-dir> [--json out.json] [--globs-only]
 * Exit codes: 0 all resolve, 2 a referenced id is missing from the index, 1 usage/IO.
 */

import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import process from 'node:process'

const args = process.argv.slice(2)
const positional = args.filter(a => !a.startsWith('--'))
const [deckPath, storybookDir] = positional
const jsonFlagIdx = args.indexOf('--json')
const jsonOut = jsonFlagIdx !== -1 ? args[jsonFlagIdx + 1] : undefined
const globsOnly = args.includes('--globs-only')

if (!deckPath || !storybookDir) {
  console.error('Usage: node scripts/freeze-deck.js <deck.md> <storybook-static-dir> [--json out.json]')
  process.exit(1)
}

const indexPath = join(storybookDir, 'index.json')
if (!existsSync(deckPath)) {
  console.error(`❌ Deck not found: ${deckPath}`)
  process.exit(1)
}
if (!existsSync(indexPath)) {
  console.error(`❌ Storybook index not found: ${indexPath}`)
  console.error('   Build Storybook first (pnpm build-storybook) so index.json exists.')
  process.exit(1)
}

// Both the MDC layout annotation and <StoryFrame> carry the id in story="…",
// so one pattern covers both. De-duplicated, first-seen order.
function extractStoryIds(markdown) {
  const ids = []
  const seen = new Set()
  const re = /\bstory=["']([^"']+)["']/g
  let m = re.exec(markdown)
  while (m !== null) {
    const id = m[1]
    if (!seen.has(id)) {
      seen.add(id)
      ids.push(id)
    }
    m = re.exec(markdown)
  }
  return ids
}

const deck = await readFile(deckPath, 'utf-8')
const index = JSON.parse(await readFile(indexPath, 'utf-8'))
const entries = index.entries ?? index.stories ?? {}

const referenced = extractStoryIds(deck)

const resolved = []
const broken = []
for (const id of referenced) {
  const entry = entries[id]
  if (entry?.importPath)
    resolved.push({ id, importPath: entry.importPath, title: entry.title })
  else
    broken.push(id)
}

// Normalise importPath ("./stories/.../X.stories.tsx") to a glob-friendly path.
const keepFiles = [...new Set(resolved.map(r => r.importPath.replace(/^\.\//, '')))].sort()

const report = {
  deck: relative(process.cwd(), resolve(deckPath)),
  storybook: relative(process.cwd(), resolve(storybookDir)),
  referencedCount: referenced.length,
  resolvedCount: resolved.length,
  brokenCount: broken.length,
  keepFiles,
  resolved,
  broken,
}

// main.ts resolves globs relative to .storybook/, importPath is relative to the
// project root — so prefix `../`.
if (globsOnly) {
  if (broken.length > 0) {
    console.error(`✗ ${broken.length} broken reference(s): ${broken.join(', ')}`)
    process.exit(2)
  }
  const globs = keepFiles.map(f => `../${f}`).join(',')
  process.stdout.write(globs)
  process.exit(0)
}

console.log(`\n📊 Deck: ${report.deck}`)
console.log(`   Referenced stories : ${referenced.length}`)
console.log(`   Resolved           : ${resolved.length}`)
console.log(`   Source files to keep (reduced build):`)
for (const f of keepFiles)
  console.log(`     • ${f}`)

if (broken.length > 0) {
  console.error(`\n⚠️  BROKEN references (${broken.length}) — absent from the current Storybook index:`)
  for (const id of broken)
    console.error(`     ✗ ${id}`)
  console.error('\n   These slides will render empty. Fix the deck ids, or re-promote the screens,')
  console.error('   before freezing — a frozen bundle would otherwise preserve broken embeds.')
}

if (jsonOut) {
  await writeFile(jsonOut, `${JSON.stringify(report, null, 2)}\n`, 'utf-8')
  console.log(`\n📝 Report written: ${jsonOut}`)
}

process.exit(broken.length > 0 ? 2 : 0)
