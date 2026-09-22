/**
 * Rename the theme a deployed instance's decks declare, over SSH, through the
 * app container (its bundle carries better-sqlite3 and yjs). A theme's name
 * lives in the frontmatter of every published version, draft and snapshot, and
 * in the `theme` column the catalog reads, so a rename by hand in the editor
 * would miss most of them.
 *
 * DRY-RUN BY DEFAULT: prints the decks it would rewrite. `--apply` writes.
 *
 *   node scripts/theme-rename.ts <from> <to>            # plan against prod
 *   node scripts/theme-rename.ts <from> <to> --apply    # write
 *   node scripts/theme-rename.ts <from> <to> --staging  # target staging
 *
 * The container answers the texts, this script computes the new ones, and a
 * second call writes them back: the rule of what a theme declaration looks like
 * stays in `lib/theme-rename.ts`, tested here rather than copied into the
 * remote module. A draft is edited in its own Yjs document and re-encoded, so
 * the editors merge with it instead of losing their history.
 *
 * Host and containers come from the environment: CONTENT_PUSH_SSH,
 * CONTENT_PUSH_CONTAINER (vignettes) and CONTENT_PUSH_STAGING_CONTAINER
 * (vignettes-staging).
 */

import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import * as Y from 'yjs'
import { DECK_TEXT_FIELD } from '../layers/studio/shared/collab/ydoc.ts'
import { renameTheme, themeValueRange } from './lib/theme-rename.ts'

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const STAGING = args.includes('--staging')
const [FROM, TO] = args.filter(a => !a.startsWith('--'))
if (!FROM || !TO) {
  console.error('usage: theme-rename.ts <from> <to> [--apply] [--staging]')
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

// Runs inside the container. `read` answers every text that names the theme
// (the precise rule runs here, on the way back); `write` stores what came back.
const REMOTE = String.raw`
import Database from 'better-sqlite3'
import { Buffer } from 'node:buffer'
import process from 'node:process'
const job = JSON.parse(Buffer.from(JOB_B64, 'base64').toString())
const db = new Database(process.env.NUXT_DB_PATH || '/app/.data/slides.db')

if (job.read) {
  const like = '%' + job.from + '%'
  console.log(JSON.stringify({
    columns: db.prepare('select slug from decks where theme = ?').all(job.from).map(r => r.slug),
    versions: db.prepare('select id, deck_slug as slug, raw from deck_versions where raw like ?').all(like),
    snapshots: db.prepare('select id, deck_slug as slug, raw from deck_draft_snapshots where raw like ?').all(like),
    drafts: db.prepare('select deck_slug as slug, ydoc from deck_drafts').all()
      .map(r => ({ slug: r.slug, ydoc: Buffer.from(r.ydoc).toString('base64') })),
  }))
}
else {
  const now = Math.floor(Date.now() / 1000)
  db.transaction(() => {
    for (const slug of job.columns)
      db.prepare('update decks set theme = ?, updated_at = ? where slug = ?').run(job.to, now, slug)
    for (const { id, raw } of job.versions)
      db.prepare('update deck_versions set raw = ? where id = ?').run(raw, id)
    for (const { id, raw } of job.snapshots)
      db.prepare('update deck_draft_snapshots set raw = ? where id = ?').run(raw, id)
    for (const { slug, ydoc } of job.drafts)
      db.prepare('update deck_drafts set ydoc = ?, updated_at = ? where deck_slug = ?').run(Buffer.from(ydoc, 'base64'), now, slug)
  })()
  console.log(JSON.stringify({ done: true }))
}
`

function remote<T>(job: object): T {
  const payload = Buffer.from(JSON.stringify(job)).toString('base64')
  const result = spawnSync('ssh', [
    SSH!,
    `sudo docker exec -i -w /app/.output/server ${CONTAINER} node --input-type=module -`,
  ], { input: `const JOB_B64 = ${JSON.stringify(payload)}\n${REMOTE}`, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })

  if (result.status !== 0) {
    console.error(result.stderr || result.stdout)
    process.exit(result.status ?? 1)
  }
  return JSON.parse(result.stdout.trim().split('\n').pop() ?? '{}') as T
}

interface Row { id: number, slug: string, raw: string }
interface Draft { slug: string, ydoc: string }

console.log(`cible   : ${SSH} / ${CONTAINER}`)
console.log(`thème   : ${FROM} → ${TO}`)
console.log(`mode    : ${APPLY ? 'APPLY' : 'DRY-RUN (aucune écriture)'}\n`)

const stored = remote<{ columns: string[], versions: Row[], snapshots: Row[], drafts: Draft[] }>({ read: true, from: FROM })

function rewrite(rows: Row[]) {
  return rows
    .map(row => ({ id: row.id, slug: row.slug, raw: renameTheme(row.raw, FROM, TO) }))
    .filter((row): row is Row => row.raw !== null)
}

const versions = rewrite(stored.versions)
const snapshots = rewrite(stored.snapshots)

const drafts: Draft[] = []
for (const draft of stored.drafts) {
  const doc = new Y.Doc()
  Y.applyUpdate(doc, new Uint8Array(Buffer.from(draft.ydoc, 'base64')))
  const text = doc.getText(DECK_TEXT_FIELD)
  const range = themeValueRange(text.toString(), FROM)
  if (range) {
    // An edit of the same document keeps the history the editors merge with.
    doc.transact(() => {
      text.delete(range.index, range.length)
      text.insert(range.index, TO)
    })
    drafts.push({ slug: draft.slug, ydoc: Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64') })
  }
  doc.destroy()
}

const slugs = [...new Set([...stored.columns, ...versions, ...snapshots, ...drafts].map(r => typeof r === 'string' ? r : r.slug))].sort()
for (const slug of slugs) {
  const parts = [
    stored.columns.includes(slug) ? 'colonne' : null,
    versions.filter(v => v.slug === slug).length ? `${versions.filter(v => v.slug === slug).length} version(s) publiée(s)` : null,
    snapshots.filter(s => s.slug === slug).length ? `${snapshots.filter(s => s.slug === slug).length} instantané(s)` : null,
    drafts.some(d => d.slug === slug) ? 'brouillon' : null,
  ].filter(Boolean)
  console.log(`  · ${slug} : ${parts.join(', ')}`)
}
if (slugs.length === 0)
  console.log(`  aucun deck ne déclare « ${FROM} »`)

if (APPLY && slugs.length) {
  remote({ read: false, to: TO, columns: stored.columns, versions, snapshots, drafts })
  console.log('\n✅ Renommé.')
}
else if (slugs.length) {
  console.log('\nDry-run terminé. Relancer avec --apply pour écrire.')
}
