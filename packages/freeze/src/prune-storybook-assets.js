/**
 * Prunes a built Storybook's staticDir assets down to the set its stories
 * actually reference. Scans the built JS/CSS/HTML for root-absolute asset URLs —
 * post-bundling every transitive import is an inlined string literal, so this
 * catches what static source-scanning misses. Keeps the Storybook runtime and
 * referenced assets; removes the rest.
 *
 * Usage: node scripts/prune-storybook-assets.js <built-storybook-dir> [--dry]
 */

import { existsSync } from 'node:fs'
import { readdir, readFile, rm, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'
import process from 'node:process'
import { isStorybookRuntime } from '@vignettes/core/render/embed-storybook'

const [storybookDir, ...flags] = process.argv.slice(2)
const DRY = flags.includes('--dry')

if (!storybookDir || !existsSync(storybookDir)) {
  console.error('Usage: node scripts/prune-storybook-assets.js <built-storybook-dir> [--dry]')
  process.exit(1)
}

// Text files scanned for asset references.
const TEXT_EXT = /\.(?:js|mjs|cjs|css|html|json|svg|map)$/i
// Files treated as referenceable static assets (root-absolute URL targets).
const ASSET_EXT = /\.(?:jpe?g|png|webp|gif|avif|svg|woff2?|ttf|otf|eot|mp4|webm|mp3|wav|ico|json|geojson|pdf|xlsx?)$/i

async function listFiles(dir, root, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const abs = join(dir, e.name)
    if (e.isDirectory())
      await listFiles(abs, root, out)
    else
      out.push(relative(root, abs))
  }
  return out
}

/** Collect every root-absolute asset URL referenced by the built text files. */
async function collectReferences(root) {
  const refs = new Set()
  const scanRoots = ['assets', 'iframe.html', 'index.html', 'sb-preview', 'sb-manager']
  // The backtick opener is essential: data files emit photo paths as template
  // literals, and missing it would prune assets a deck needs.
  const urlRe = /["'`(]\s*(\/[a-z0-9][\w/.@-]*\.[a-z0-9]{2,5})\b/gi

  for (const entry of scanRoots) {
    const abs = join(root, entry)
    if (!existsSync(abs))
      continue
    const isDir = (await stat(abs)).isDirectory()
    const files = isDir ? await listFiles(abs, root) : [entry]
    for (const rel of files) {
      if (!TEXT_EXT.test(rel))
        continue
      let text
      try {
        text = await readFile(join(root, rel), 'utf-8')
      }
      catch {
        continue
      }
      for (const match of text.matchAll(urlRe)) {
        const url = match[1].split('?')[0].split('#')[0]
        if (ASSET_EXT.test(url))
          refs.add(url.replace(/^\/+/, ''))
      }
    }
  }
  return refs
}

const refs = await collectReferences(storybookDir)

const topEntries = await readdir(storybookDir, { withFileTypes: true })
let removedFiles = 0
let removedBytes = 0
let keptFiles = 0

async function pruneEntry(name) {
  const abs = join(storybookDir, name)
  const files = await listFiles(abs, storybookDir)
  for (const rel of files) {
    if (refs.has(rel)) {
      keptFiles++
      continue
    }
    const s = await stat(join(storybookDir, rel)).catch(() => null)
    if (s)
      removedBytes += s.size
    removedFiles++
    if (!DRY)
      await rm(join(storybookDir, rel), { force: true })
  }
}

for (const e of topEntries) {
  if (isStorybookRuntime(e.name))
    continue
  if (e.isDirectory()) {
    await pruneEntry(e.name)
  }
  else {
    if (refs.has(e.name)) {
      keptFiles++
      continue
    }
    const s = await stat(join(storybookDir, e.name)).catch(() => null)
    if (s)
      removedBytes += s.size
    removedFiles++
    if (!DRY)
      await rm(join(storybookDir, e.name), { force: true })
  }
}

async function pruneEmptyDirs(dir) {
  if (!existsSync(dir))
    return
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      const sub = join(dir, e.name)
      await pruneEmptyDirs(sub)
      const left = await readdir(sub).catch(() => [])
      if (left.length === 0 && !DRY)
        await rm(sub, { recursive: true, force: true })
    }
  }
}
if (!DRY)
  await pruneEmptyDirs(storybookDir)

const mb = n => (n / 1024 / 1024).toFixed(1)
console.log(`  → ${DRY ? '[dry] would keep' : 'Kept'} ${keptFiles} referenced asset(s), ${refs.size} distinct URL(s)`)
console.log(`  → ${DRY ? '[dry] would remove' : 'Removed'} ${removedFiles} unreferenced file(s), freeing ${mb(removedBytes)} Mo`)
