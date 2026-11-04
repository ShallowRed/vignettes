/**
 * Push one or more stubs of `presentations/` into a deployed instance, through
 * its `/api/content/push` route and the content token. The way a deck written
 * as a file reaches production without a copy-paste into the editor.
 *
 * DRY-RUN BY DEFAULT: prints what each slug would become. `--apply` writes.
 *
 *   node scripts/content-push.ts <slug>[,<slug>]            # plan against prod
 *   node scripts/content-push.ts <slug> --apply             # write
 *   node scripts/content-push.ts <slug> --staging           # target the staging instance
 *   node scripts/content-push.ts <slug> --content=examples # read another content directory
 *   node scripts/content-push.ts <slug> --unlisted         # create it outside the catalog
 *   node scripts/content-push.ts <slug> --folder=<slug>    # create it in this folder of the instance
 *
 * The instance decides per slug (`server/utils/content-push.ts`): a deck it
 * does not know is created from the frontmatter and from `registry.yml`, a deck
 * it owns gets a new published version with its access axes untouched, a
 * trashed deck is refused, an identical text is a no-op. A folder the instance
 * lacks is reported, not created. With `--folder`, a created deck goes to that
 * folder and its `project` key names it; the instance refuses a folder it lacks
 * and a known deck filed in another folder. The draft of a republished deck
 * follows the new version when it held the replaced one, and keeps changes not
 * published otherwise; each line says which.
 */

import type { DraftFollow, PushedStub, PushResult } from '../layers/studio/server/utils/content-push.ts'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { contentDir } from '@vignettes/nuxt/build/theme-registry'
import { load as parseYaml } from 'js-yaml'
import { callInstance, instanceFromEnv } from './lib/instance.ts'

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const STAGING = args.includes('--staging')
const UNLISTED = args.includes('--unlisted')
const FOLDER = args.find(a => a.startsWith('--folder='))?.slice(9) || undefined
const slugs = (args.find(a => !a.startsWith('--')) ?? '').split(',').map(s => s.trim()).filter(Boolean)
if (slugs.length === 0) {
  console.error('usage: content-push.ts <slug>[,<slug>] [--apply] [--staging] [--folder=<slug>]')
  process.exit(2)
}

const instance = instanceFromEnv(STAGING)
const OVERRIDE = args.find(a => a.startsWith('--content='))?.slice(10)
const CONTENT_DIR = OVERRIDE ? resolve(OVERRIDE) : contentDir(process.cwd())

interface RegistryEntry { slug?: string, alias?: string, lifecycle?: string, frozenBundle?: string }
const REGISTRY = existsSync(join(CONTENT_DIR, 'registry.yml'))
  ? (parseYaml(readFileSync(join(CONTENT_DIR, 'registry.yml'), 'utf8')) ?? {}) as Record<string, RegistryEntry>
  : {}

/** The registry entry naming this deck, keyed by its alias. */
function registryOf(slug: string): PushedStub['registry'] {
  const found = Object.entries(REGISTRY).find(([alias, entry]) => (entry?.slug ?? alias) === slug)
  if (!found)
    return null
  const [alias, entry] = found
  return { alias, lifecycle: entry?.lifecycle ?? 'live', frozenBundle: entry?.frozenBundle ?? null }
}

function readStub(slug: string): PushedStub {
  const path = [join(CONTENT_DIR, `${slug}.md`), join(CONTENT_DIR, 'archived', `${slug}.md`)].find(existsSync)
  if (!path)
    throw new Error(`${slug} : aucun stub presentations/${slug}.md`)
  return { slug, raw: readFileSync(path, 'utf8'), registry: registryOf(slug), unlisted: UNLISTED }
}

console.log(`cible   : ${instance.url}`)
console.log(`mode    : ${APPLY ? 'APPLY' : 'DRY-RUN (aucune écriture)'}\n`)

const LABEL: Record<PushResult['action'], string> = {
  create: 'à créer (statut depuis le frontmatter)',
  republish: 'nouvelle version publiée (accès inchangés)',
  identical: 'identique à la version publiée, rien à faire',
  trashed: 'à la corbeille : refusé, restaurer d\'abord',
}
const DRAFT_LABEL: Record<DraftFollow, string | null> = {
  none: null,
  updated: 'brouillon mis à jour',
  kept: 'brouillon gardé : modifications non publiées dans l\'éditeur',
  failed: 'brouillon non mis à jour : erreur, voir le journal de l\'instance',
}
try {
  const results = await callInstance<PushResult[]>(instance, '/api/content/push', { stubs: slugs.map(readStub), apply: APPLY, folder: FOLDER })
  for (const r of results)
    console.log(`  · ${r.slug} : ${LABEL[r.action]}${r.draft && DRAFT_LABEL[r.draft] ? ` ; ${DRAFT_LABEL[r.draft]}` : ''}${r.folderMissing ? ` ; dossier « ${r.folderMissing} » absent de l'instance (à créer dans l'interface)` : ''}`)
}
catch (error) {
  console.error(`✖ ${(error as Error).message}`)
  process.exit(1)
}
console.log(APPLY ? '\n✅ Poussé.' : '\nDry-run terminé. Relancer avec --apply pour écrire.')
