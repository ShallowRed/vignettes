import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { Buffer } from 'node:buffer'
import { eq } from 'drizzle-orm'
import * as Y from 'yjs'
import { DECK_TEXT_FIELD } from '../../../shared/collab/ydoc.ts'
import { referencedImages } from '../../../shared/storage/media-refs.ts'
import { headingParserInsertion, insertHeadingParser } from '../heading-parser.ts'
import { recordDeckMedia } from './media-index.ts'
import { dataMigrations, deckDrafts, deckDraftSnapshots, deckVersions } from './schema.ts'

type Db = BetterSQLite3Database<Record<string, unknown>>

/**
 * Rewrites of the stored content that SQL cannot express, run once each at boot
 * after the schema migrations. `data_migrations` records the ones applied.
 */

/**
 * Slides used to split by headings unless a deck said `parser: separator`; they
 * now split by `---` unless it says `parser: heading`. Every deck that relied on
 * the old default gets the key written, in its draft and in each published
 * version, so its slides stay the same.
 */
function explicitHeadingParser(db: Db): void {
  for (const version of db.select({ id: deckVersions.id, raw: deckVersions.raw }).from(deckVersions).all()) {
    const raw = insertHeadingParser(version.raw)
    if (raw !== null)
      db.update(deckVersions).set({ raw }).where(eq(deckVersions.id, version.id)).run()
  }

  for (const draft of db.select({ deckSlug: deckDrafts.deckSlug, ydoc: deckDrafts.ydoc }).from(deckDrafts).all()) {
    const doc = new Y.Doc()
    Y.applyUpdate(doc, new Uint8Array(draft.ydoc))
    const text = doc.getText(DECK_TEXT_FIELD)
    const insertion = headingParserInsertion(text.toString())
    if (insertion) {
      // An insertion into the same document keeps the history the editors merge with.
      text.insert(insertion.index, insertion.text)
      db.update(deckDrafts)
        .set({ ydoc: Buffer.from(Y.encodeStateAsUpdate(doc)) })
        .where(eq(deckDrafts.deckSlug, draft.deckSlug))
        .run()
    }
    doc.destroy()
  }
}

/** Records in `deck_media` every image the versions, snapshots and drafts reference. */
function indexExistingDeckMedia(db: Db): void {
  const texts: { slug: string, raw: string }[] = [
    ...db.select({ slug: deckVersions.deckSlug, raw: deckVersions.raw }).from(deckVersions).all(),
    ...db.select({ slug: deckDraftSnapshots.deckSlug, raw: deckDraftSnapshots.raw }).from(deckDraftSnapshots).all(),
  ]

  for (const draft of db.select({ deckSlug: deckDrafts.deckSlug, ydoc: deckDrafts.ydoc }).from(deckDrafts).all()) {
    const doc = new Y.Doc()
    Y.applyUpdate(doc, new Uint8Array(draft.ydoc))
    texts.push({ slug: draft.deckSlug, raw: doc.getText(DECK_TEXT_FIELD).toString() })
    doc.destroy()
  }

  for (const { slug, raw } of texts)
    recordDeckMedia(db, slug, referencedImages(raw))
}

const DATA_MIGRATIONS: { name: string, run: (db: Db) => void }[] = [
  { name: 'explicit-heading-parser', run: explicitHeadingParser },
  { name: 'index-existing-deck-media', run: indexExistingDeckMedia },
  // A second pass, now that the index also covers the files of the content
  // space: `/images/**` is served with the visibility of the decks citing it,
  // and a file no deck cites answers 404.
  { name: 'index-existing-deck-images', run: indexExistingDeckMedia },
]

export function runDataMigrations(db: Db): void {
  const applied = new Set(db.select({ name: dataMigrations.name }).from(dataMigrations).all().map(row => row.name))
  for (const migration of DATA_MIGRATIONS) {
    if (applied.has(migration.name))
      continue
    db.transaction((tx) => {
      migration.run(tx as unknown as Db)
      tx.insert(dataMigrations).values({ name: migration.name, appliedAt: new Date() }).run()
    })
    console.info(`[data-migrations] applied ${migration.name}`)
  }
}
