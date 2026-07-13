/**
 * Prints a field of a registry entry, for Makefile wiring. `slug` falls back to
 * the alias when unset (mirroring the server); `theme` is read from the stub
 * frontmatter, not the registry, and defaults to `brand`. Exits 1 (empty stdout)
 * when the alias is unknown or the field is unset.
 *
 * Usage: node scripts/registry-get.js <alias> <field>
 */

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { load as parseYaml } from 'js-yaml'
import { splitFrontmatter } from '../shared/deck/frontmatter.ts'

const [alias, field] = process.argv.slice(2)
if (!alias || !field) {
  console.error('Usage: node scripts/registry-get.js <alias> <field>')
  process.exit(1)
}

const presentationsDir = join(process.cwd(), 'presentations')
const doc = parseYaml(await readFile(join(presentationsDir, 'registry.yml'), 'utf-8')) || {}
const entry = doc[alias]
if (!entry) {
  process.exit(1)
}

const slug = entry.slug || alias

if (field === 'theme') {
  const folders = entry.access ? [entry.access] : ['public', 'draft', 'private', 'semi-private']
  let theme
  for (const folder of folders) {
    const stub = join(presentationsDir, folder, `${slug}.md`)
    if (!existsSync(stub))
      continue
    const raw = await readFile(stub, 'utf-8')
    const value = splitFrontmatter(raw).data.theme
    if (typeof value === 'string' && value.trim()) {
      theme = value.trim()
      break
    }
  }
  process.stdout.write(theme || 'brand')
  process.exit(0)
}

// `--entry-yaml` dumps the whole registry entry (for a frozen bundle's provenance).
if (field === '--entry-yaml') {
  const { dump } = await import('js-yaml')
  process.stdout.write(dump({ [alias]: entry }))
  process.exit(0)
}

const value = field === 'slug' ? slug : entry[field]
if (value === undefined || value === null)
  process.exit(1)

process.stdout.write(String(value))
