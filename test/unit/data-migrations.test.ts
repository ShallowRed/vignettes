import { Buffer } from 'node:buffer'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { headingParserInsertion, runDataMigrations } from '../../layers/studio/server/db/data-migrations'
import { dataMigrations, deckDrafts, deckVersions } from '../../layers/studio/server/db/schema'
import { markdownToYDocUpdate, yDocUpdateToMarkdown } from '../../layers/studio/shared/collab/ydoc'
import { freshDb, NOW, seedDeck } from './helpers/db'

function insert(raw: string): string {
  const insertion = headingParserInsertion(raw)
  return insertion ? raw.slice(0, insertion.index) + insertion.text + raw.slice(insertion.index) : raw
}

describe('headingParserInsertion', () => {
  it('adds the key at the end of the frontmatter', () => {
    expect(insert('---\ntitle: Deck\n---\n\n# Title')).toBe('---\ntitle: Deck\nparser: heading\n---\n\n# Title')
  })

  it('adds a frontmatter to a deck without one', () => {
    expect(insert('# Title\n\n## Next')).toBe('---\nparser: heading\n---\n\n# Title\n\n## Next')
  })

  it('leaves a deck that names its parser, an empty deck and an unclosed frontmatter', () => {
    expect(headingParserInsertion('---\nparser: separator\n---\n\n# A')).toBeNull()
    expect(headingParserInsertion('---\nparser: heading\ntitle: A\n---\n')).toBeNull()
    expect(headingParserInsertion('  \n')).toBeNull()
    expect(headingParserInsertion('---\ntitle: A\n# never closed')).toBeNull()
  })
})

describe('runDataMigrations', () => {
  it('writes the heading parser into published versions and drafts, once', () => {
    const db = freshDb()
    seedDeck(db, 'old')
    seedDeck(db, 'explicit')
    db.insert(deckVersions).values([
      { deckSlug: 'old', raw: '---\ntitle: Old\n---\n\n# Old', publishedBy: 'alice', publishedAt: NOW },
      { deckSlug: 'explicit', raw: '---\nparser: separator\n---\n\n# New', publishedBy: 'alice', publishedAt: NOW },
    ]).run()
    db.insert(deckDrafts).values({ deckSlug: 'old', ydoc: Buffer.from(markdownToYDocUpdate('# Old draft')), updatedAt: NOW }).run()

    runDataMigrations(db)

    const raws = db.select({ slug: deckVersions.deckSlug, raw: deckVersions.raw }).from(deckVersions).all()
    expect(raws).toEqual([
      { slug: 'old', raw: '---\ntitle: Old\nparser: heading\n---\n\n# Old' },
      { slug: 'explicit', raw: '---\nparser: separator\n---\n\n# New' },
    ])
    const draft = db.select().from(deckDrafts).where(eq(deckDrafts.deckSlug, 'old')).get()!
    expect(yDocUpdateToMarkdown(new Uint8Array(draft.ydoc))).toBe('---\nparser: heading\n---\n\n# Old draft')
    expect(db.select().from(dataMigrations).all().map(row => row.name)).toEqual(['explicit-heading-parser'])

    // A deck written after the migration relies on the new default and stays untouched.
    db.update(deckVersions).set({ raw: '# Separator deck' }).where(eq(deckVersions.deckSlug, 'explicit')).run()
    runDataMigrations(db)
    expect(db.select({ raw: deckVersions.raw }).from(deckVersions).where(eq(deckVersions.deckSlug, 'explicit')).get()!.raw).toBe('# Separator deck')
  })
})
