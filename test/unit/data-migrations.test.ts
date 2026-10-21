import { Buffer } from 'node:buffer'
import { describe, expect, it, vi } from 'vitest'
import { headingParserInsertion } from '../../layers/studio/server/db/heading-parser'
import { themeRenameChanges } from '../../layers/studio/server/utils/theme-rename'
import { markdownToYDocUpdate, yDocUpdateToMarkdown } from '../../layers/studio/shared/collab/ydoc'
import { ADAPTERS, NOW, seedDeck, useAdapter } from './helpers/adapters'

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

describe.each(ADAPTERS)('data migrations ($name)', (adapter) => {
  const db = useAdapter(adapter)

  it('writes the heading parser into published versions and drafts, once', async () => {
    await seedDeck(db.rows, 'old')
    await seedDeck(db.rows, 'explicit')
    await db.rows.insert('deckVersions', [
      { deckSlug: 'old', raw: '---\ntitle: Old\n---\n\n# Old', publishedBy: 'alice', publishedAt: NOW },
      { deckSlug: 'explicit', raw: '---\nparser: separator\n---\n\n# New', publishedBy: 'alice', publishedAt: NOW },
    ])
    await db.rows.insert('deckDrafts', { deckSlug: 'old', ydoc: Buffer.from(markdownToYDocUpdate('# Old draft')), updatedAt: NOW })

    await db.migrateData()

    const raws = (await db.rows.select('deckVersions')).map(row => ({ slug: row.deckSlug, raw: row.raw }))
    expect(raws).toEqual([
      { slug: 'old', raw: '---\ntitle: Old\nparser: heading\n---\n\n# Old' },
      { slug: 'explicit', raw: '---\nparser: separator\n---\n\n# New' },
    ])
    const [draft] = await db.rows.select('deckDrafts', { deckSlug: 'old' })
    expect(yDocUpdateToMarkdown(new Uint8Array(draft!.ydoc))).toBe('---\nparser: heading\n---\n\n# Old draft')
    expect((await db.rows.select('dataMigrations')).map(row => row.name).sort())
      .toEqual(['explicit-heading-parser', 'index-existing-deck-images', 'index-existing-deck-media', 'replace-directory-names-that-are-not-slugs'])

    // A deck written after the migration relies on the new default and stays untouched.
    await db.rows.update('deckVersions', { raw: '# Separator deck' }, { deckSlug: 'explicit' })
    await db.migrateData()
    expect((await db.rows.select('deckVersions', { deckSlug: 'explicit' }))[0]!.raw).toBe('# Separator deck')
  })

  it('keys the images of published versions, snapshots and drafts to their decks', async () => {
    await seedDeck(db.rows, 'published')
    await seedDeck(db.rows, 'drafted')
    await db.rows.insert('deckVersions', { deckSlug: 'published', raw: '# P\n\n![](/media/aaa.png)', publishedBy: 'alice', publishedAt: NOW })
    await db.rows.insert('deckDraftSnapshots', { deckSlug: 'published', raw: '# P\n\n![](/media/bbb.webp)', authors: ['alice'], createdAt: NOW })
    await db.rows.insert('deckDrafts', { deckSlug: 'drafted', ydoc: Buffer.from(markdownToYDocUpdate('# D\n\n![](/media/ccc.jpg)')), updatedAt: NOW })

    await db.migrateData()

    expect((await db.rows.select('deckMedia')).map(row => ({ name: row.mediaName, slug: row.deckSlug }))).toEqual([
      { name: 'aaa.png', slug: 'published' },
      { name: 'bbb.webp', slug: 'published' },
      { name: 'ccc.jpg', slug: 'drafted' },
    ])
  })
})

describe.each(ADAPTERS)('data migrations of the directory names ($name)', (adapter) => {
  const db = useAdapter(adapter)

  it('moves an alias that is not a slug to the historical ones, clears such a bundle, and keeps the slugs', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await seedDeck(db.rows, 'climbs', { alias: 'climbs', frozenBundle: '..' })
    await seedDeck(db.rows, 'nested', { alias: 'talk.v2', frozenBundle: 'nested-2026' })
    await seedDeck(db.rows, 'taken', { alias: 'été' })
    await seedDeck(db.rows, 'holder', { alias: 'taken' })
    await seedDeck(db.rows, 'valid', { alias: 'valid-talk', frozenBundle: 'valid-2026' })

    await db.migrateData()

    expect((await db.rows.select('decks')).map(row => [row.slug, row.alias, row.frozenBundle]).sort()).toEqual([
      ['climbs', 'climbs', null],
      ['holder', 'taken', null],
      ['nested', 'nested', 'nested-2026'],
      ['taken', null, null],
      ['valid', 'valid-talk', 'valid-2026'],
    ])
    expect((await db.rows.select('deckAliases')).map(row => [row.alias, row.deckSlug]).sort())
      .toEqual([['talk.v2', 'nested'], ['été', 'taken']])
    vi.restoreAllMocks()
  })
})

describe.each(ADAPTERS)('content rewrites ($name)', (adapter) => {
  const db = useAdapter(adapter)

  it('renames a theme in the decks kept, dating the rows it changes', async () => {
    for (const slug of ['kept', 'left']) {
      await seedDeck(db.rows, slug, { theme: 'dsfr' })
      await db.rows.insert('deckVersions', { deckSlug: slug, raw: '---\ntheme: dsfr\n---\n\n# V', publishedBy: 'alice', publishedAt: NOW })
      await db.rows.insert('deckDrafts', { deckSlug: slug, ydoc: Buffer.from(markdownToYDocUpdate('---\ntheme: dsfr\n---\n\n# D')), updatedAt: NOW })
    }
    const at = new Date(NOW.getTime() + 60_000)

    await db.stores.rewrites.rewrite(content => themeRenameChanges(content, 'dsfr', 'harbor', ['kept']), { at })

    expect((await db.rows.select('decks')).map(row => [row.slug, row.theme, row.updatedAt.getTime()]))
      .toEqual([['kept', 'harbor', at.getTime()], ['left', 'dsfr', NOW.getTime()]])
    expect((await db.rows.select('deckVersions')).map(row => row.raw))
      .toEqual(['---\ntheme: harbor\n---\n\n# V', '---\ntheme: dsfr\n---\n\n# V'])
    const drafts = await db.rows.select('deckDrafts')
    expect(drafts.map(row => [row.deckSlug, yDocUpdateToMarkdown(new Uint8Array(row.ydoc)), row.updatedAt.getTime()]))
      .toEqual([['kept', '---\ntheme: harbor\n---\n\n# D', at.getTime()], ['left', '---\ntheme: dsfr\n---\n\n# D', NOW.getTime()]])
    expect(await db.rows.select('dataMigrations')).toEqual([])
  })
})
