import type { ContentChanges, ContentRewrites, StoredContent } from './ports.ts'
import * as Y from 'yjs'
import { DECK_TEXT_FIELD, yDocUpdateToMarkdown } from '../../shared/collab/ydoc.ts'
import { referencedImages } from '../../shared/storage/media-refs.ts'
import { headingParserInsertion, insertHeadingParser } from './heading-parser.ts'

/**
 * Rewrites of the stored content that SQL cannot express, run once each at boot
 * after the schema migrations, on every adapter. `data_migrations` records the
 * ones applied.
 */
interface DataMigration {
  name: string
  change: (content: StoredContent) => ContentChanges
}

/**
 * A deck without a `parser` key splits its slides by `---`. The decks stored
 * when the default split by headings get `parser: heading` written in their
 * draft and in each published version, so their slides stay the same.
 */
function explicitHeadingParser({ versions, drafts }: StoredContent): ContentChanges {
  return {
    versions: versions.flatMap(({ id, raw }) => {
      const rewritten = insertHeadingParser(raw)
      return rewritten === null ? [] : [{ id, raw: rewritten }]
    }),
    drafts: drafts.flatMap(({ slug, ydoc }) => {
      const doc = new Y.Doc()
      Y.applyUpdate(doc, ydoc)
      const text = doc.getText(DECK_TEXT_FIELD)
      const insertion = headingParserInsertion(text.toString())
      // An insertion into the same document keeps the history the editors merge with.
      if (insertion)
        text.insert(insertion.index, insertion.text)
      const rewritten = insertion ? [{ slug, ydoc: Y.encodeStateAsUpdate(doc) }] : []
      doc.destroy()
      return rewritten
    }),
  }
}

/** Records in `deck_media` every image the versions, snapshots and drafts reference. */
function indexExistingDeckMedia({ versions, snapshots, drafts }: StoredContent): ContentChanges {
  const texts = [
    ...versions,
    ...snapshots,
    ...drafts.map(({ slug, ydoc }) => ({ slug, raw: yDocUpdateToMarkdown(ydoc) })),
  ]
  return { media: texts.map(({ slug, raw }) => ({ slug, names: referencedImages(raw) })) }
}

const DATA_MIGRATIONS: DataMigration[] = [
  { name: 'explicit-heading-parser', change: explicitHeadingParser },
  { name: 'index-existing-deck-media', change: indexExistingDeckMedia },
  // A second pass, now that the index also covers the files of the content
  // space: `/images/**` is served with the visibility of the decks citing it,
  // and a file no deck cites answers 404.
  { name: 'index-existing-deck-images', change: indexExistingDeckMedia },
]

/** Runs the data migrations not applied yet, each in its own transaction. */
export async function runDataMigrations(rewrites: ContentRewrites): Promise<void> {
  const applied = await rewrites.appliedMigrations()
  for (const migration of DATA_MIGRATIONS) {
    if (applied.has(migration.name))
      continue
    await rewrites.rewrite(migration.change, { migration: migration.name })
    console.info(`[data-migrations] applied ${migration.name}`)
  }
}
