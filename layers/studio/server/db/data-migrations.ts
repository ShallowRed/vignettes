import type { ContentChanges, ContentRewrites, StoredContent } from './ports.ts'
import { isDeckSlug } from '@vignettes/core/deck'
import { editDraftUpdate, yDocUpdateToMarkdown } from '../../shared/collab/ydoc.ts'
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
      // An insertion into the same document keeps the history the editors merge with.
      const rewritten = editDraftUpdate(ydoc, (text) => {
        const insertion = headingParserInsertion(text.toString())
        if (insertion)
          text.insert(insertion.index, insertion.text)
        return Boolean(insertion)
      })
      return rewritten ? [{ slug, ydoc: rewritten }] : []
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

/**
 * The alias and the frozen bundle of a deck name a path segment of `/p/` and
 * `/frozen/`, and the bundle a directory of `.frozen/`. An alias that is not a
 * slug becomes a historical alias of the deck, and the slug takes its place. When
 * another deck holds the slug, the deck is left without an alias and its links
 * answer 404. A frozen bundle that is not
 * a slug is cleared, and the deck's slug names its bundle.
 */
function replaceDirectoryNamesThatAreNotSlugs({ decks }: StoredContent): ContentChanges {
  const isSafe = (name: string | null) => name === null || isDeckSlug(name)
  const taken = new Set(decks.map(deck => deck.alias))
  const changed = decks.filter(deck => !isSafe(deck.alias) || !isSafe(deck.frozenBundle))
  for (const { slug, alias, frozenBundle } of changed)
    console.warn(`[data-migrations] ${slug}: replaces what is not a slug in alias ${JSON.stringify(alias)}, frozen bundle ${JSON.stringify(frozenBundle)}`)
  return {
    directory: changed.map(({ slug, alias, frozenBundle }) => ({
      slug,
      alias: isSafe(alias) ? alias : taken.has(slug) ? null : slug,
      frozenBundle: isSafe(frozenBundle) ? frozenBundle : null,
    })),
    aliases: changed.flatMap(({ slug, alias }) => alias !== null && !isDeckSlug(alias) ? [{ alias, slug }] : []),
  }
}

const DATA_MIGRATIONS: DataMigration[] = [
  { name: 'explicit-heading-parser', change: explicitHeadingParser },
  { name: 'index-existing-deck-media', change: indexExistingDeckMedia },
  // A second pass, now that the index also covers the files of the content
  // space: `/images/**` is served with the visibility of the decks citing it,
  // and a file no deck cites answers 404.
  { name: 'index-existing-deck-images', change: indexExistingDeckMedia },
  { name: 'replace-directory-names-that-are-not-slugs', change: replaceDirectoryNamesThatAreNotSlugs },
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
