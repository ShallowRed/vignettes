import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { Buffer } from 'node:buffer'
import { DECK_TEXT_FIELD } from '#shared/collab/ydoc'
import { eq } from 'drizzle-orm'
import * as Y from 'yjs'
import { dataMigrations, deckDrafts, deckVersions } from './schema'

type Db = BetterSQLite3Database<Record<string, unknown>>

/**
 * Rewrites of the stored content that SQL cannot express, run once each at boot
 * after the schema migrations. `data_migrations` records the ones applied.
 */

/** Where to insert `parser: heading` in a deck that has no `parser` key, or null. */
export function headingParserInsertion(raw: string): { index: number, text: string } | null {
  if (!raw.trim())
    return null
  const lines = raw.split('\n')
  if (lines[0]?.trim() !== '---')
    return { index: 0, text: '---\nparser: heading\n---\n\n' }
  let offset = lines[0]!.length + 1
  for (let n = 1; n < lines.length; n++) {
    const line = lines[n]!
    if (line.trim() === '---')
      return { index: offset, text: 'parser: heading\n' }
    if (/^parser\s*:/.test(line))
      return null
    offset += line.length + 1
  }
  // An unclosed frontmatter block: leave the deck as it is.
  return null
}

function insertHeadingParser(raw: string): string | null {
  const insertion = headingParserInsertion(raw)
  return insertion ? raw.slice(0, insertion.index) + insertion.text + raw.slice(insertion.index) : null
}

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

const DATA_MIGRATIONS: { name: string, run: (db: Db) => void }[] = [
  { name: 'explicit-heading-parser', run: explicitHeadingParser },
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
