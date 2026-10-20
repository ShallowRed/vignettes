/**
 * Pull the published version of one or more decks from a deployed database into
 * the local one, over SSH, through the app container. The reverse of
 * `content-push`: a deck that only exists in production, such as a frozen one,
 * has to be here before `freeze` can rebuild its bundle.
 *
 * DRY-RUN BY DEFAULT: prints what each slug would become. `--apply` writes.
 *
 *   node scripts/content-pull.ts <slug>[,<slug>]            # plan from prod
 *   node scripts/content-pull.ts <slug> --apply             # write
 *   node scripts/content-pull.ts <slug> --staging           # read the staging container
 *   node scripts/content-pull.ts <slug> --db=/path/to.db    # target another local database
 *
 * Per slug: the row's catalog axes (title, status, project, theme, alias,
 * lifecycle, frozen bundle, unlisted) and the published markdown come over; a
 * deck the local database already owns gets a new published version and its
 * axes follow the remote, a trashed local deck is refused, an identical text is
 * a no-op. The access password never travels: a semi-private deck lands
 * without its hash, closed to everyone but a privileged account. A folder the
 * local database lacks is reported and the deck lands without one.
 *
 * Host and containers come from the environment: CONTENT_PUSH_SSH,
 * CONTENT_PUSH_CONTAINER (vignettes) and CONTENT_PUSH_STAGING_CONTAINER
 * (vignettes-staging).
 */

import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { readDatabaseConfig } from '../layers/studio/server/db/config.ts'
import { openDatabaseFile } from '../layers/studio/server/db/open.ts'

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const STAGING = args.includes('--staging')
const slugs = (args.find(a => !a.startsWith('--')) ?? '').split(',').map(s => s.trim()).filter(Boolean)
if (slugs.length === 0) {
  console.error('usage: content-pull.ts <slug>[,<slug>] [--apply] [--staging] [--db=<path>]')
  process.exit(2)
}

const SSH = process.env.CONTENT_PUSH_SSH
if (!SSH) {
  console.error('CONTENT_PUSH_SSH is missing: the SSH host of the instance (see mise.local.toml).')
  process.exit(2)
}
const CONTAINER = STAGING
  ? (process.env.CONTENT_PUSH_STAGING_CONTAINER || 'vignettes-staging')
  : (process.env.CONTENT_PUSH_CONTAINER || 'vignettes')
const DB_PATH = args.find(a => a.startsWith('--db='))?.slice(5) ?? readDatabaseConfig(process.env).dbPath

interface Pulled {
  slug: string
  title: string
  status: string
  lifecycle: string
  project: string | null
  theme: string | null
  alias: string | null
  frozenBundle: string | null
  unlisted: number
  raw: string | null
}

// Runs inside the container: reads only, the answer travels back as JSON.
const REMOTE = String.raw`
import Database from 'better-sqlite3'
import { Buffer } from 'node:buffer'
import process from 'node:process'
const slugs = JSON.parse(Buffer.from(SLUGS_B64, 'base64').toString())
const db = new Database(process.env.NUXT_DB_PATH || '/app/.data/slides.db', { readonly: true })
const row = db.prepare(
  'select d.slug, d.title, d.status, d.lifecycle, d.project, d.theme, d.alias, d.frozen_bundle as frozenBundle, d.unlisted, v.raw '
  + 'from decks d left join deck_versions v on v.id = d.published_version_id where d.slug = ? and d.deleted_at is null',
)
console.log(JSON.stringify(slugs.map(slug => row.get(slug) ?? null)))
`

const payload = Buffer.from(JSON.stringify(slugs)).toString('base64')
console.log(`source  : ${SSH} / ${CONTAINER}`)
console.log(`cible   : ${DB_PATH}`)
console.log(`mode    : ${APPLY ? 'APPLY' : 'DRY-RUN (aucune écriture)'}\n`)

const result = spawnSync('ssh', [
  SSH,
  `sudo docker exec -i -w /app/.output/server ${CONTAINER} node --input-type=module -`,
], { input: `const SLUGS_B64 = ${JSON.stringify(payload)}\n${REMOTE}`, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
if (result.status !== 0) {
  console.error(result.stderr || result.stdout)
  process.exit(result.status ?? 1)
}
const pulled = JSON.parse(result.stdout.trim().split('\n').pop() ?? '[]') as (Pulled | null)[]

const { archive } = openDatabaseFile({ dbPath: DB_PATH }, { readonly: !APPLY }).stores
const locals = new Map((await archive.decks()).map(row => [row.slug, row]))
const localProjects = new Set((await archive.projects()).map(row => row.slug))
const at = new Date()
const LABEL: Record<string, string> = {
  create: 'à créer',
  republish: 'nouvelle version publiée, axes du catalogue alignés',
  identical: 'identique à la version publiée locale, rien à faire',
  trashed: 'à la corbeille en local : refusé, restaurer d\'abord',
  missing: 'absent de l\'instance, ou sans version publiée',
}

for (const [i, deck] of pulled.entries()) {
  const slug = slugs[i]!
  if (!deck || deck.raw == null) {
    console.log(`  · ${slug} : ${LABEL.missing}`)
    continue
  }
  const local = locals.get(slug)
  const folderMissing = deck.project && !localProjects.has(deck.project)
  const action = local ? (local.trashed ? 'trashed' : local.raw === deck.raw ? 'identical' : 'republish') : 'create'
  console.log(`  · ${slug} : ${LABEL[action]}${folderMissing ? ` ; dossier « ${deck.project} » absent en local, le deck arrive sans dossier` : ''}`)
  if (!APPLY || action === 'trashed' || action === 'identical')
    continue

  await archive.apply([
    {
      kind: 'deck',
      slug,
      axes: {
        title: deck.title,
        status: deck.status,
        lifecycle: deck.lifecycle,
        project: folderMissing ? null : deck.project,
        theme: deck.theme,
        alias: deck.alias,
        frozenBundle: deck.frozenBundle,
        unlisted: Boolean(deck.unlisted),
      },
    },
    { kind: 'version', slug, raw: deck.raw },
  ], { by: 'content-pull', at })
}

console.log(APPLY ? '\n✅ Rapatrié.' : '\nDry-run terminé. Relancer avec --apply pour écrire.')
