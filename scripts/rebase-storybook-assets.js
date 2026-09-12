/**
 * Makes a frozen Storybook self-contained by rewriting root-absolute staticDir
 * asset URLs (`/vitrine/x.jpg`) to relative (`vitrine/x`). The assets live in the
 * bundle under `_storybook/<dir>/`, and iframe.html's `<base target="_parent">`
 * has no href, so relative URLs resolve against the iframe location — where the
 * asset is. Only rewrites URLs whose top segment is a real static-asset dir
 * (never `/assets`, `/sb-*`). Idempotent.
 *
 * Usage: node scripts/rebase-storybook-assets.js <built-storybook-dir> [--dry]
 */

import { existsSync } from 'node:fs'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { detectAssetRoots } from '@vignettes/core/render/embed-storybook'

const [storybookDir, ...flags] = process.argv.slice(2)
const DRY = flags.includes('--dry')

if (!storybookDir || !existsSync(storybookDir)) {
  console.error('Usage: node scripts/rebase-storybook-assets.js <built-storybook-dir> [--dry]')
  process.exit(1)
}

// Top-level static-asset names in the bundle — a root-absolute URL whose first
// segment is one of these is a staticDir asset safe to rebase to relative.
const topLevel = await readdir(storybookDir, { withFileTypes: true })
const assetRoots = new Set(detectAssetRoots(topLevel.map(e => e.name)))

if (assetRoots.size === 0) {
  console.log('  → No static-asset roots to rebase (already self-contained).')
  process.exit(0)
}

// Match `/<root>/…` (or bare `/<file>`) after a string/template/url() opener,
// capturing the opener; the leading slash is dropped → relative URL.
const rootsAlt = [...assetRoots]
  .map(r => r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|')
const re = new RegExp(`(["'\`(]\\s*)/((?:${rootsAlt})(?:/[^"'\`)\\s]*)?)`, 'g')

const SCAN_DIR = join(storybookDir, 'assets')
const scanFiles = []
async function collect(dir) {
  if (!existsSync(dir))
    return
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const abs = join(dir, e.name)
    if (e.isDirectory())
      await collect(abs)
    else if (/\.(?:js|mjs|cjs|css|map)$/.test(e.name))
      scanFiles.push(abs)
  }
}
await collect(SCAN_DIR)
// iframe.html / index.html may also carry root-absolute refs.
for (const html of ['iframe.html', 'index.html']) {
  const p = join(storybookDir, html)
  if (existsSync(p))
    scanFiles.push(p)
}

let filesChanged = 0
let urlsRewritten = 0

for (const file of scanFiles) {
  const text = await readFile(file, 'utf-8')
  let count = 0
  // Prefix depends on resolution context: CSS url() resolves against the
  // stylesheet (_storybook/assets/*.css → needs `../`); a JS string becomes a DOM
  // attr resolved against the document (_storybook/iframe.html → no prefix).
  const isCss = /\.css$/.test(file)
  const prefix = isCss ? '../' : ''
  const out = text.replace(re, (_m, opener, rel) => {
    count++
    return `${opener}${prefix}${rel}`
  })
  if (count > 0) {
    urlsRewritten += count
    filesChanged++
    if (!DRY)
      await writeFile(file, out, 'utf-8')
  }
}

console.log(`  → ${DRY ? '[dry] would rebase' : 'Rebased'} ${urlsRewritten} root-absolute asset URL(s) to relative across ${filesChanged} file(s)`)
console.log(`  → asset roots made self-contained: ${[...assetRoots].join(', ')}`)
