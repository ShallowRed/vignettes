/**
 * Pulls a collaborative CodiMD note's live body into its repo stub, keeping the
 * stub's frontmatter (theme, storybook link, access) — the note's own frontmatter
 * is stripped, the hand-editable stub wins. Alias resolves through registry.yml.
 *
 * Usage: node scripts/pull-note.js <alias> [--codimd-url <url>] [--access <folder>]
 * Env: NUXT_CODIMD_URL (fallback for --codimd-url).
 */

import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { load as parseYaml } from 'js-yaml'

const args = process.argv.slice(2)
const alias = args.find(a => !a.startsWith('--'))
const codimdUrl = (argVal('--codimd-url') || process.env.NUXT_CODIMD_URL || '').replace(/\/+$/, '')
const accessHint = argVal('--access')

function argVal(flag) {
  const i = args.indexOf(flag)
  return i !== -1 ? args[i + 1] : undefined
}

if (!alias) {
  console.error('Usage: node scripts/pull-note.js <alias> [--codimd-url <url>] [--access <folder>]')
  process.exit(1)
}

const ROOT = process.cwd()
const registryPath = join(ROOT, 'presentations', 'registry.yml')
if (!existsSync(registryPath)) {
  console.error(`❌ Registry not found: ${registryPath}`)
  process.exit(1)
}

const registry = parseYaml(await readFile(registryPath, 'utf-8')) || {}
const entry = registry[alias]
if (!entry) {
  console.error(`❌ Alias "${alias}" not in registry.`)
  process.exit(1)
}
if (entry.source !== 'codimd') {
  console.error(`❌ Alias "${alias}" source is "${entry.source ?? 'none'}" — only "codimd" is supported here.`)
  process.exit(1)
}
if (!entry.noteId) {
  console.error(`❌ Alias "${alias}" has no noteId.`)
  process.exit(1)
}
if (!codimdUrl) {
  console.error('❌ No CodiMD URL — pass --codimd-url or set NUXT_CODIMD_URL.')
  process.exit(1)
}

const slug = entry.slug || alias

// Find the stub across access folders (mirrors server resolution).
const ACCESS = accessHint ? [accessHint] : ['public', 'draft', 'private', 'semi-private']
let stubPath = null
for (const a of ACCESS) {
  const p = join(ROOT, 'presentations', a, `${slug}.md`)
  if (existsSync(p)) {
    stubPath = p
    break
  }
}
if (!stubPath) {
  console.error(`❌ Stub "${slug}.md" not found under presentations/{${ACCESS.join(',')}}/`)
  process.exit(1)
}

const url = `${codimdUrl}/${encodeURIComponent(entry.noteId)}/download`
console.log(`▶  Fetching ${url}`)
const remote = await fetch(url, { headers: { Accept: 'text/markdown, text/plain' } })
if (!remote.ok) {
  console.error(`❌ CodiMD responded ${remote.status} for note "${entry.noteId}"`)
  process.exit(1)
}
const remoteMd = await remote.text()

function stripFrontmatter(md) {
  const m = md.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/)
  return m ? md.slice(m[0].length) : md
}
function extractFrontmatter(md) {
  const m = md.match(/^(---\r?\n[\s\S]*?\r?\n---)\r?\n?/)
  return m ? m[1] : ''
}

const stub = await readFile(stubPath, 'utf-8')
const stubFrontmatter = extractFrontmatter(stub)
const body = stripFrontmatter(remoteMd).trimStart()

if (!stubFrontmatter) {
  console.warn('⚠️  Stub has no frontmatter — writing body only.')
}

const next = stubFrontmatter ? `${stubFrontmatter}\n\n${body}\n` : `${body}\n`
await writeFile(stubPath, next, 'utf-8')

console.log(`✅ Pulled note "${entry.noteId}" into ${stubPath.replace(`${ROOT}/`, '')}`)
console.log('   Stub frontmatter preserved (theme, storybook, access). Review & commit.')
