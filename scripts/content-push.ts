/**
 * Push one or more stubs of `presentations/` into a deployed database, over
 * SSH, through the app container (its bundle carries better-sqlite3). The way
 * a deck written as a file reaches production without a copy-paste into the
 * editor.
 *
 * DRY-RUN BY DEFAULT: prints what each slug would become. `--apply` writes.
 *
 *   node scripts/content-push.ts <slug>[,<slug>]            # plan against prod
 *   node scripts/content-push.ts <slug> --apply             # write
 *   node scripts/content-push.ts <slug> --staging           # target the staging container
 *   node scripts/content-push.ts <slug> --content=examples # read another content directory
 *   node scripts/content-push.ts <slug> --unlisted         # create it outside the catalog
 *
 * Per slug: a deck the database does not know is created managed, its access
 * axes read from the frontmatter (status defaults to private, fail closed) and
 * its alias, lifecycle and frozen bundle from `registry.yml`;
 * a deck it owns gets a new published version and its title and theme follow
 * the file, access axes untouched (what the editor's publish does); a trashed
 * deck is refused; an identical text is a no-op. A folder the database lacks
 * is reported, not created.
 *
 * Host and containers come from the environment: CONTENT_PUSH_SSH,
 * CONTENT_PUSH_CONTAINER (vignettes) and CONTENT_PUSH_STAGING_CONTAINER
 * (vignettes-staging).
 */

import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { contentDir } from '@vignettes/nuxt/build/theme-registry'
import { load as parseYaml } from 'js-yaml'

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const STAGING = args.includes('--staging')
const UNLISTED = args.includes('--unlisted')
const slugs = (args.find(a => !a.startsWith('--')) ?? '').split(',').map(s => s.trim()).filter(Boolean)
if (slugs.length === 0) {
  console.error('usage: content-push.ts <slug>[,<slug>] [--apply] [--staging]')
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
const OVERRIDE = args.find(a => a.startsWith('--content='))?.slice(10)
const CONTENT_DIR = OVERRIDE ? join(process.cwd(), OVERRIDE) : contentDir(process.cwd())

interface RegistryEntry { slug?: string, alias?: string, lifecycle?: string, frozenBundle?: string }
const REGISTRY = existsSync(join(CONTENT_DIR, 'registry.yml'))
  ? (parseYaml(readFileSync(join(CONTENT_DIR, 'registry.yml'), 'utf8')) ?? {}) as Record<string, RegistryEntry>
  : {}

/** The registry entry naming this deck, keyed by its alias. */
function registryOf(slug: string): { alias: string, lifecycle: string, frozenBundle: string | null } | null {
  const found = Object.entries(REGISTRY).find(([alias, entry]) => (entry?.slug ?? alias) === slug)
  if (!found)
    return null
  const [alias, entry] = found
  return { alias, lifecycle: entry?.lifecycle ?? 'live', frozenBundle: entry?.frozenBundle ?? null }
}

interface Stub {
  slug: string
  raw: string
  meta: { title: string | null, status: string, project: string | null, theme: string | null, unlisted: number, accessPasswordHash: string | null, alias: string | null, lifecycle: string, frozenBundle: string | null }
}

function readStub(slug: string): Stub {
  const path = [join(CONTENT_DIR, `${slug}.md`), join(CONTENT_DIR, 'archived', `${slug}.md`)].find(existsSync)
  if (!path)
    throw new Error(`${slug} : aucun stub presentations/${slug}.md`)
  const raw = readFileSync(path, 'utf8')
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  const data = (m ? parseYaml(m[1]!) : {}) as Record<string, unknown>
  const status = ['public', 'private', 'semi-private'].includes(String(data.status)) ? String(data.status) : 'private'
  const registry = registryOf(slug)
  return {
    slug,
    raw,
    meta: {
      title: (data.title as string) ?? null,
      status,
      project: (data.project as string) ?? null,
      theme: (data.theme as string) ?? null,
      unlisted: data.unlisted || UNLISTED ? 1 : 0,
      accessPasswordHash: (data.accessPassword as string) ?? null,
      alias: registry?.alias ?? null,
      lifecycle: registry?.lifecycle ?? 'live',
      frozenBundle: registry?.frozenBundle ?? null,
    },
  }
}

// Runs inside the container: SQL only, the decisions above mirrored per stub.
// The payload is prepended to this module, so it travels on stdin: a deck body
// and its access-password hash never reach the remote command line.
const REMOTE = String.raw`
import Database from 'better-sqlite3'
import { Buffer } from 'node:buffer'
import process from 'node:process'
const { stubs, apply } = JSON.parse(Buffer.from(PUSH_B64, 'base64').toString())
const db = new Database(process.env.NUXT_DB_PATH || '/app/.data/slides.db')
const now = Math.floor(Date.now() / 1000)
const out = []
for (const { slug, raw, meta } of stubs) {
  const row = db.prepare('select slug, managed, deleted_at, published_version_id from decks where slug = ?').get(slug)
  const current = row?.published_version_id
    ? db.prepare('select raw from deck_versions where id = ?').get(row.published_version_id)?.raw
    : null
  const folderMissing = meta.project && !db.prepare('select 1 from projects where slug = ?').get(meta.project)
  let action = row ? (row.deleted_at ? 'trashed' : current === raw ? 'identical' : 'republish') : 'create'
  out.push({ slug, action, folderMissing: folderMissing ? meta.project : null })
  if (!apply || action === 'trashed' || action === 'identical')
    continue
  db.transaction(() => {
    if (action === 'create') {
      db.prepare(
        'insert into decks (slug, title, status, lifecycle, project, theme, access_password_hash, unlisted, managed, created_at, updated_at) '
        + 'values (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
      ).run(slug, meta.title ?? slug, meta.status, meta.lifecycle, meta.project, meta.theme, meta.accessPasswordHash, meta.unlisted, now, now)
    }
    else {
      db.prepare('update decks set title = coalesce(?, title), theme = coalesce(?, theme), managed = 1, updated_at = ? where slug = ?')
        .run(meta.title, meta.theme, now, slug)
    }
    if (meta.alias) {
      db.prepare('update decks set alias = ?, lifecycle = ?, frozen_bundle = ?, updated_at = ? where slug = ?')
        .run(meta.alias, meta.lifecycle, meta.frozenBundle, now, slug)
    }
    const res = db.prepare('insert into deck_versions (deck_slug, raw, published_by, published_at) values (?, ?, ?, ?)')
      .run(slug, raw, 'content-push', now)
    db.prepare('update decks set published_version_id = ?, updated_at = ? where slug = ?').run(res.lastInsertRowid, now, slug)
  })()
}
console.log(JSON.stringify(out))
`

const stubs = slugs.map(readStub)
const payload = Buffer.from(JSON.stringify({ stubs, apply: APPLY })).toString('base64')

console.log(`cible   : ${SSH} / ${CONTAINER}`)
console.log(`mode    : ${APPLY ? 'APPLY' : 'DRY-RUN (aucune écriture)'}\n`)

const result = spawnSync('ssh', [
  SSH,
  `sudo docker exec -i -w /app/.output/server ${CONTAINER} node --input-type=module -`,
], { input: `const PUSH_B64 = ${JSON.stringify(payload)}\n${REMOTE}`, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

if (result.status !== 0) {
  console.error(result.stderr || result.stdout)
  process.exit(result.status ?? 1)
}
const line = result.stdout.trim().split('\n').pop() ?? '[]'
const LABEL: Record<string, string> = {
  create: 'à créer (statut depuis le frontmatter)',
  republish: 'nouvelle version publiée (accès inchangés)',
  identical: 'identique à la version publiée, rien à faire',
  trashed: 'à la corbeille : refusé, restaurer d\'abord',
}
for (const r of JSON.parse(line) as { slug: string, action: string, folderMissing: string | null }[]) {
  console.log(`  · ${r.slug} : ${LABEL[r.action] ?? r.action}${r.folderMissing ? ` ; dossier « ${r.folderMissing} » absent de la base (à créer dans l'interface)` : ''}`)
}
console.log(APPLY ? '\n✅ Poussé.' : '\nDry-run terminé. Relancer avec --apply pour écrire.')
