import type { NoteSource } from '#shared/deck'
import { resolveDeck, stringifyDocument } from '#shared/deck'
import { eq } from 'drizzle-orm'
import { decks, deckVersions } from '../db/schema'
import { useDb } from './db'
import { noteSource, publishedSource } from './sources'

/**
 * One-shot migration: freeze each collaborative note into a published version.
 *
 * A `live` deck with `source`/`noteId` fetches its body from CodiMD on every
 * request, so the database version only holds the older repo stub. Unplugging
 * CodiMD without this step would silently serve that stale body. Here the note
 * is resolved exactly as the `/p` route resolves it today (stub frontmatter,
 * `storybook` overridden by the note) and stored as a normal published version;
 * `source`/`noteId` are then cleared, which IS the cutover — the deck stops
 * being note-backed the moment it is snapshotted.
 *
 * Dry-run by default, idempotent (a snapshotted deck no longer matches), and
 * never publishes a stub in place of an unreachable note.
 */

export interface NoteSnapshotEntry {
  slug: string
  source: string
  noteId: string
  /** Bytes of the published version before/after, to eyeball the change. */
  before: number
  after: number
  status: 'snapshot' | 'unchanged' | 'unreachable' | 'no-stub'
}

export interface NoteSnapshotPlan {
  candidates: number
  entries: NoteSnapshotEntry[]
  warnings: string[]
}

export interface NoteSnapshotResult { plan: NoteSnapshotPlan, applied: boolean }

function isNoteSource(value: unknown): value is NoteSource {
  return value === 'codimd' || value === 'hackmd'
}

export async function runNoteSnapshot(options: { apply: boolean }): Promise<NoteSnapshotResult> {
  const db = useDb()
  const rows = db.select().from(decks).all()
    .filter(row => row.lifecycle === 'live' && isNoteSource(row.source) && Boolean(row.noteId))

  const plan: NoteSnapshotPlan = { candidates: rows.length, entries: [], warnings: [] }
  const writes: { slug: string, raw: string }[] = []

  for (const row of rows) {
    const source = row.source as NoteSource
    const noteId = row.noteId!
    const stub = (await publishedSource.load(row.slug))?.raw

    if (stub == null) {
      plan.entries.push({ slug: row.slug, source, noteId, before: 0, after: 0, status: 'no-stub' })
      plan.warnings.push(`"${row.slug}" n'a ni version publiée ni stub : rien à quoi ajouter le corps de la note`)
      continue
    }

    const remote = await noteSource(source).load(noteId)
    if (!remote) {
      plan.entries.push({ slug: row.slug, source, noteId, before: stub.length, after: 0, status: 'unreachable' })
      plan.warnings.push(`note "${noteId}" (${source}) injoignable : "${row.slug}" est laissé intact plutôt que figé sur son ancien corps`)
      continue
    }

    // Same policy as the `/p` route: the stub owns the frontmatter, the note owns
    // the body and its own `storybook` (the stub's points at a local dev server).
    const resolved = resolveDeck({ stub, remote: remote.raw, noteOverride: ['storybook'], source })
    // The frozen copy is no longer note-backed; carrying the provenance keys
    // would just be a dangling reference.
    const { source: _source, noteId: _noteId, ...meta } = resolved.meta
    const raw = stringifyDocument(meta as Record<string, unknown>, resolved.body)

    if (raw === stub) {
      plan.entries.push({ slug: row.slug, source, noteId, before: stub.length, after: raw.length, status: 'unchanged' })
    }
    else {
      plan.entries.push({ slug: row.slug, source, noteId, before: stub.length, after: raw.length, status: 'snapshot' })
    }
    // Detach even when the body already matched: the point is to stop fetching.
    writes.push({ slug: row.slug, raw })
  }

  if (!options.apply || writes.length === 0)
    return { plan, applied: false }

  const now = new Date()
  db.transaction((tx) => {
    for (const { slug, raw } of writes) {
      const version = tx.insert(deckVersions)
        .values({ deckSlug: slug, raw, publishedBy: 'note-snapshot', publishedAt: now })
        .returning({ id: deckVersions.id })
        .get()!
      tx.update(decks)
        .set({ publishedVersionId: version.id, source: null, noteId: null, managed: true, updatedAt: now })
        .where(eq(decks.slug, slug))
        .run()
    }
  })

  return { plan, applied: true }
}
