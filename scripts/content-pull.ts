/**
 * Pull the published version of one or more decks from a deployed instance into
 * the local database, through the instance's `/api/content/decks` route and the
 * content token. The reverse of `content-push`: a deck that only exists in
 * production, such as a frozen one, has to be here before `freeze` can rebuild
 * its bundle.
 *
 * DRY-RUN BY DEFAULT: prints what each slug would become. `--apply` writes.
 *
 *   node scripts/content-pull.ts <slug>[,<slug>]            # plan from prod
 *   node scripts/content-pull.ts <slug> --apply             # write
 *   node scripts/content-pull.ts <slug> --staging           # read the staging instance
 *   node scripts/content-pull.ts <slug> --db=/path/to.db    # target a local SQLite file
 *
 * Per slug: the row's catalog axes (title, status, project, theme, alias,
 * lifecycle, frozen bundle, unlisted) and the published markdown come over; a
 * deck the local database already owns gets a new published version and its
 * axes follow the remote, a trashed local deck is refused, an identical text is
 * a no-op. The access password never travels: a semi-private deck lands
 * without its hash, closed to everyone but a privileged account. A folder the
 * local database lacks is reported and the deck lands without one.
 */

import process from 'node:process'
import { isDeckSlug } from '@vignettes/core/deck'
import { describeDatabase } from '../layers/studio/server/db/config.ts'
import { openDatabaseFile } from '../layers/studio/server/db/open.ts'
import { scriptDatabaseConfig } from './lib/database.ts'
import { callInstance, instanceFromEnv } from './lib/instance.ts'

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const STAGING = args.includes('--staging')
const slugs = (args.find(a => !a.startsWith('--')) ?? '').split(',').map(s => s.trim()).filter(Boolean)
if (slugs.length === 0) {
  console.error('usage: content-pull.ts <slug>[,<slug>] [--apply] [--staging] [--db=<path>]')
  process.exit(2)
}

const instance = instanceFromEnv(STAGING)
const DATABASE = scriptDatabaseConfig(args)

interface Pulled {
  slug: string
  title: string
  status: string
  lifecycle: string
  project: string | null
  theme: string | null
  alias: string | null
  frozenBundle: string | null
  unlisted: boolean
  raw: string | null
}

console.log(`source  : ${instance.url}`)
console.log(`cible   : ${describeDatabase(DATABASE)}`)
console.log(`mode    : ${APPLY ? 'APPLY' : 'DRY-RUN (aucune écriture)'}\n`)

const pulled = await callInstance<(Pulled | null)[]>(instance, `/api/content/decks?slugs=${slugs.map(encodeURIComponent).join(',')}`)
  .catch((error: Error) => {
    console.error(`✖ ${error.message}`)
    process.exit(1)
  })

const database = await openDatabaseFile(DATABASE, { readonly: !APPLY })
const { archive } = database.stores
const locals = new Map((await archive.decks()).map(row => [row.slug, row]))
const localProjects = new Set((await archive.projects()).map(row => row.slug))
const at = new Date()
const LABEL: Record<string, string> = {
  create: 'à créer',
  republish: 'nouvelle version publiée, axes du catalogue alignés',
  identical: 'identique à la version publiée locale, rien à faire',
  trashed: 'à la corbeille en local : refusé, restaurer d\'abord',
  missing: 'absent de l\'instance, ou sans version publiée',
  unsafe: 'ignoré : son alias ou son frozenBundle contient un caractère autre que des lettres, des chiffres, - et _',
}

for (const [i, deck] of pulled.entries()) {
  const slug = slugs[i]!
  if (!deck || deck.raw == null) {
    console.log(`  · ${slug} : ${LABEL.missing}`)
    continue
  }
  // The alias and the bundle each name a path segment of `/p/` or `/frozen/`.
  if (![deck.alias, deck.frozenBundle].every(name => name == null || isDeckSlug(name))) {
    console.warn(`  ⚠ ${slug} : ${LABEL.unsafe}`)
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
        unlisted: deck.unlisted,
      },
    },
    { kind: 'version', slug, raw: deck.raw },
  ], { by: 'content-pull', at })
}

await database.close()
console.log(APPLY ? '\n✅ Rapatrié.' : '\nDry-run terminé. Relancer avec --apply pour écrire.')
