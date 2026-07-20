/**
 * Freeze the collaborative notes into published versions — the local half of
 * `server/utils/note-snapshot.ts` (same rules, same output), so the cutover can
 * be rehearsed and verified against a local database before touching production.
 *
 * A `live` deck carrying `source`/`noteId` fetches its body from CodiMD on every
 * request; its published version only holds the older repo stub. This resolves
 * the note exactly as the `/p` route does (stub frontmatter, `storybook` taken
 * from the note), stores the result as a published version, and clears
 * `source`/`note_id` — which IS the cutover.
 *
 * DRY-RUN BY DEFAULT. Never publishes a stub in place of an unreachable note.
 *
 *   node scripts/note-snapshot.ts                        # plan
 *   node scripts/note-snapshot.ts --apply                # write
 *   node scripts/note-snapshot.ts --db=/path/to.db
 *   NUXT_CODIMD_URL=https://md.example.com node scripts/note-snapshot.ts
 */

import { join } from 'node:path'
import process from 'node:process'
import Database from 'better-sqlite3'
import { stringifyDocument } from '../shared/deck/frontmatter.ts'
import { resolveDeck } from '../shared/deck/resolve.ts'

const ROOT = process.cwd()
const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const DB_PATH = args.find(a => a.startsWith('--db='))?.slice(5)
  ?? process.env.NUXT_DB_PATH
  ?? join(ROOT, '.data', 'slides.db')
const CODIMD_URL = (process.env.NUXT_CODIMD_URL || 'https://md.example.org').replace(/\/+$/, '')
const HACKMD_TOKEN = process.env.NUXT_HACKMD_API_TOKEN || ''

async function fetchNote(source: string, noteId: string): Promise<string | null> {
  try {
    if (source === 'hackmd') {
      if (!HACKMD_TOKEN)
        return null
      const res = await fetch(`https://api.hackmd.io/v1/notes/${encodeURIComponent(noteId)}`, {
        headers: { Authorization: `Bearer ${HACKMD_TOKEN}` },
      })
      return res.ok ? (await res.json() as { content: string }).content : null
    }
    const res = await fetch(`${CODIMD_URL}/${encodeURIComponent(noteId)}/download`, {
      headers: { Accept: 'text/markdown, text/plain' },
    })
    return res.ok ? await res.text() : null
  }
  catch {
    return null
  }
}

const db = new Database(DB_PATH)
const now = Math.floor(Date.now() / 1000)

const rows = db.prepare(`
  SELECT slug, source, note_id AS noteId, published_version_id AS publishedVersionId
  FROM decks
  WHERE lifecycle = 'live' AND source IN ('codimd', 'hackmd') AND note_id IS NOT NULL
  ORDER BY slug
`).all() as { slug: string, source: string, noteId: string, publishedVersionId: number | null }[]

console.log(`\n📓 Notes collaboratives à figer : ${rows.length}\n`)

const writes: { slug: string, raw: string }[] = []
const warnings: string[] = []

for (const row of rows) {
  const version = row.publishedVersionId == null
    ? null
    : db.prepare('SELECT raw FROM deck_versions WHERE id = ?').get(row.publishedVersionId) as { raw: string } | undefined
  const stub = version?.raw

  if (stub == null) {
    warnings.push(`${row.slug} : aucune version publiée à laquelle greffer le corps de la note`)
    continue
  }

  const remote = await fetchNote(row.source, row.noteId)
  if (remote == null) {
    warnings.push(`${row.slug} : note ${row.source}/${row.noteId} injoignable — laissé intact`)
    continue
  }

  const resolved = resolveDeck({ stub, remote, noteOverride: ['storybook'], source: row.source as 'codimd' })
  const { source: _source, noteId: _noteId, ...meta } = resolved.meta
  const raw = stringifyDocument(meta as Record<string, unknown>, resolved.body)

  const verb = raw === stub ? 'inchangé' : 'gelé'
  console.log(`  ${raw === stub ? '=' : '↻'} ${row.slug.padEnd(28)} ${String(stub.length).padStart(6)} → ${String(raw.length).padStart(6)} octets  (${verb}, ${row.source}/${row.noteId})`)
  writes.push({ slug: row.slug, raw })
}

for (const w of warnings)
  console.log(`  ⚠️  ${w}`)

if (!APPLY) {
  console.log(`\n🔍 Dry-run — rien écrit. Relancer avec --apply pour figer ${writes.length} deck(s).\n`)
  process.exit(0)
}

const insert = db.prepare(`
  INSERT INTO deck_versions (deck_slug, raw, published_by, published_at) VALUES (?, ?, 'note-snapshot', ?)
`)
const repoint = db.prepare(`
  UPDATE decks SET published_version_id = ?, source = NULL, note_id = NULL, managed = 1, updated_at = ? WHERE slug = ?
`)

db.transaction(() => {
  for (const { slug, raw } of writes) {
    const { lastInsertRowid } = insert.run(slug, raw, now)
    repoint.run(lastInsertRowid, now, slug)
  }
})()

console.log(`\n✅ ${writes.length} deck(s) figé(s) et détaché(s) de leur note.\n`)
