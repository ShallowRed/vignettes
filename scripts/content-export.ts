/**
 * Export the database back into the git content repo — the second half of
 * "web pour le vif, git pour le fond". The database stays the runtime truth;
 * this makes git the diffable, portable archive of it.
 *
 * Writes:
 *   deck_versions.raw → presentations/<slug>.md (archived/ for frozen|archived)
 *   catalog axes      → presentations/_catalog.generated.yml
 *
 * The markdown round-trips exactly: the import stored the whole stub (frontmatter
 * included) in `raw`, so exporting is writing it back untouched.
 *
 * `_catalog.generated.yml` is a DERIVED snapshot — nothing reads it at runtime.
 * It exists so a clone of the content repo carries the aliases, lifecycles and
 * note origins too, not just the bodies.
 *
 * DRY-RUN BY DEFAULT.
 *   node scripts/content-export.ts                  # plan
 *   node scripts/content-export.ts --apply          # write
 *   node scripts/content-export.ts --db=/path/to.db # read a SQLite file
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { isFrozen } from '@vignettes/core/status'
import { contentDir } from '@vignettes/nuxt/build/theme-registry'
import { dump as dumpYaml } from 'js-yaml'
import { describeDatabase } from '../layers/studio/server/db/config.ts'
import { openDatabaseFile } from '../layers/studio/server/db/open.ts'
import { scriptDatabaseConfig } from './lib/database.ts'

const ROOT = process.cwd()
const CONTENT_DIR = contentDir(ROOT)

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const DATABASE = scriptDatabaseConfig(args)

const database = await openDatabaseFile(DATABASE, { readonly: true })
const { archive } = database.stores

const rows = (await archive.decks())
  // The staging acceptance data set is test data, never part of the archive.
  .filter(row => row.managed && !row.trashed && !row.slug.toLowerCase().startsWith('recette-'))
type Row = (typeof rows)[number]

const historical = await archive.aliases()
const projects = await archive.projects()
await database.close()

/** Frozen/archived bodies live in `archived/`, mirroring the repo layout. */
function pathFor(row: Row): string {
  const archived = isFrozen(row)
  return join(CONTENT_DIR, archived ? 'archived' : '', `${row.slug}.md`)
}

function currentContent(file: string): string | null {
  try {
    return readFileSync(file, 'utf8')
  }
  catch {
    return null
  }
}

// ── Plan ────────────────────────────────────────────────────────────────────

const toWrite: { file: string, content: string, state: 'nouveau' | 'modifié' }[] = []
const unchanged: string[] = []
const noBody: string[] = []

for (const row of rows) {
  if (row.raw == null) {
    // A deck with no published version has nothing to archive yet (draft only).
    noBody.push(row.slug)
    continue
  }
  const file = pathFor(row)
  const current = currentContent(file)
  if (current === row.raw)
    unchanged.push(row.slug)
  else
    toWrite.push({ file, content: row.raw, state: current == null ? 'nouveau' : 'modifié' })
}

const catalog = {
  decks: Object.fromEntries(rows.map(r => [r.slug, {
    title: r.title,
    status: r.status,
    lifecycle: r.lifecycle,
    ...(r.alias ? { alias: r.alias } : {}),
    ...(r.project ? { project: r.project } : {}),
    ...(r.theme ? { theme: r.theme } : {}),
    ...(r.frozenBundle ? { frozenBundle: r.frozenBundle } : {}),
    ...(r.unlisted ? { unlisted: true } : {}),
    ...(r.family ? { family: r.family } : {}),
    ...(r.variantLabel ? { variantLabel: r.variantLabel } : {}),
    ...(r.supersededBy ? { supersededBy: r.supersededBy } : {}),
    ...(historical.some(h => h.slug === r.slug)
      ? { aliases: historical.filter(h => h.slug === r.slug).map(h => h.alias) }
      : {}),
  }])),
  projects: Object.fromEntries(projects.map(p => [p.slug, {
    title: p.title,
    order: p.order,
    ...(p.color ? { color: p.color } : {}),
  }])),
}

const CATALOG_FILE = join(CONTENT_DIR, '_catalog.generated.yml')
const catalogYaml = `# GÉNÉRÉ par scripts/content-export.ts — NE PAS ÉDITER À LA MAIN.\n`
  + `# Instantané dérivé de la base (qui fait foi au runtime). Rien ne le lit :\n`
  + `# il existe pour que le repo de contenu reste une archive complète.\n\n${
    dumpYaml(catalog, { lineWidth: 100, noRefs: true })}`
const catalogChanged = currentContent(CATALOG_FILE) !== catalogYaml

// ── Report ──────────────────────────────────────────────────────────────────

console.log(`base    : ${describeDatabase(DATABASE)}`)
console.log(`contenu : ${CONTENT_DIR}`)
console.log(`mode    : ${APPLY ? 'APPLY (écriture)' : 'DRY-RUN (aucune écriture)'}`)
console.log(`\ndecks managed : ${rows.length} · projets : ${projects.length} · alias historiques : ${historical.length}`)

console.log(`\nfichiers à écrire (${toWrite.length})`)
for (const w of toWrite) console.log(`  · ${w.state.padEnd(8)} ${w.file.replace(`${ROOT}/`, '')}`)
console.log(`\ninchangés (${unchanged.length})`)
console.log(`\nsans version publiée — rien à archiver (${noBody.length})`)
for (const s of noBody) console.log(`  · ${s}`)
console.log(`\n_catalog.generated.yml : ${catalogChanged ? 'à mettre à jour' : 'inchangé'}`)

if (!APPLY) {
  console.log('\nDry-run terminé — rien n\'a été écrit. Relancer avec --apply pour appliquer.')
  process.exit(0)
}

// ── Apply ───────────────────────────────────────────────────────────────────

mkdirSync(join(CONTENT_DIR, 'archived'), { recursive: true })
for (const w of toWrite)
  writeFileSync(w.file, w.content, 'utf8')
if (catalogChanged)
  writeFileSync(CATALOG_FILE, catalogYaml, 'utf8')

console.log('\n✅ Export appliqué.')
