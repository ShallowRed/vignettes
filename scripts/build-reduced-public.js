/**
 * Builds a reduced public/ dir for a frozen bundle. `nuxt generate` would copy
 * the whole repo public/ into a single-deck bundle; keep only themes/ and the
 * backgrounds the chosen theme uses (referenced in its CSS ∪ `<theme>-*`),
 * dropping a curated app-only deny-set. Runs before the build.
 *
 * Usage: node scripts/build-reduced-public.js <theme> <out-dir>
 */

import { existsSync } from 'node:fs'
import { cp, mkdir, readdir, readFile, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const PUBLIC = join(ROOT, 'public')

const [theme = 'brand', outDir] = process.argv.slice(2)
if (!outDir) {
  console.error('Usage: node scripts/build-reduced-public.js <theme> <out-dir>')
  process.exit(1)
}

// App-only assets a deck bundle never needs. Deny-set (not allow-set) so a deck
// that references an unlisted asset never loses it.
const APP_ONLY = new Set([
  'appels-a-projet.jpg',
  'clubs-departementaux.webp',
  'cycle-vie-simulateurs.png',
  'panorama-ecosysteme-simulateurs.svg',
  'partenaires.jpg',
  'qui-sommes-nous.jpg',
])

if (existsSync(outDir))
  await rm(outDir, { recursive: true })
await mkdir(outDir, { recursive: true })

// Backgrounds the theme needs: referenced in its CSS, plus the `<theme>-*` naming
// convention (the theme→bg mapping isn't always a CSS url()).
const themeCss = join(PUBLIC, 'themes', `${theme}.css`)
const referenced = new Set()
if (existsSync(themeCss)) {
  const css = await readFile(themeCss, 'utf-8')
  for (const m of css.matchAll(/backgrounds\/([\w-]+\.[a-z0-9]+)/g))
    referenced.add(m[1])
}

const bgDir = join(PUBLIC, 'backgrounds')
const keptBackgrounds = []
if (existsSync(bgDir)) {
  await mkdir(join(outDir, 'backgrounds'), { recursive: true })
  for (const f of await readdir(bgDir)) {
    const keep = referenced.has(f) || f.startsWith(`${theme}-`) || f === 'README.md'
    if (keep) {
      await cp(join(bgDir, f), join(outDir, 'backgrounds', f))
      keptBackgrounds.push(f)
    }
  }
}

// Copy the rest, skipping backgrounds (done) and the deny-set.
for (const entry of await readdir(PUBLIC, { withFileTypes: true })) {
  const name = entry.name
  if (name === 'backgrounds' || APP_ONLY.has(name))
    continue
  await cp(join(PUBLIC, name), join(outDir, name), { recursive: true })
}

console.log(`  → Reduced public for theme '${theme}': kept ${keptBackgrounds.length} background(s) [${keptBackgrounds.join(', ')}], dropped ${APP_ONLY.size} app-only asset(s)`)
