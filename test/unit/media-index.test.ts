import { beforeEach, describe, expect, it } from 'vitest'
import { ADAPTERS, seedDeck, useAdapter } from './helpers/adapters'

describe.each(ADAPTERS)('media index ($name)', (adapter) => {
  const db = useAdapter(adapter)
  const index = () => db.stores.mediaIndex

  beforeEach(async () => {
    for (const slug of ['uploaded', 'citing', 'other'])
      await seedDeck(db.rows, slug)
  })

  it('answers the deck an image was uploaded to, whoever cites it after', async () => {
    await index().record('uploaded', ['pic.png'])
    await index().recordFromMarkdown('citing', '# C\n\n![](/media/pic.png)')
    expect(await index().decksFor('pic.png')).toEqual(['uploaded'])
    expect((await db.rows.select('deckMedia', { mediaName: 'pic.png' })).map(row => [row.deckSlug, row.origin]).sort())
      .toEqual([['citing', false], ['uploaded', true]])
  })

  it('makes a deck that cited the image first its origin once the upload is recorded', async () => {
    await index().recordFromMarkdown('uploaded', '![](/media/pic.png)')
    await index().record('uploaded', ['pic.png'])
    expect(await db.rows.select('deckMedia', { mediaName: 'pic.png' })).toMatchObject([{ deckSlug: 'uploaded', origin: true }])
  })

  it('records every image the markdown references, once each', async () => {
    await index().recordFromMarkdown('citing', '![](/media/a.png)\n\n![](/media/b.webp)\n\n![](/media/a.png)')
    await index().recordFromMarkdown('citing', '![](/media/a.png)')
    expect((await db.rows.select('deckMedia', { deckSlug: 'citing' })).map(row => row.mediaName).sort()).toEqual(['a.png', 'b.webp'])
    await index().recordFromMarkdown('other', '# No image')
    expect(await db.rows.select('deckMedia', { deckSlug: 'other' })).toEqual([])
  })

  it('falls back on every citing deck when no upload was recorded', async () => {
    await index().recordFromMarkdown('citing', '![](/media/old.png)')
    await index().recordFromMarkdown('other', '![](/media/old.png)')
    expect((await index().decksFor('old.png')).sort()).toEqual(['citing', 'other'])
    expect(await index().decksFor('unknown.png')).toEqual([])
  })
})
