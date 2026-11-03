import { describe, expect, it } from 'vitest'
import { ADAPTERS, NOW, seedDeck, useAdapter } from './helpers/adapters'

const AT = new Date(1_700_000_100_000)

describe.each(ADAPTERS)('content archive ($name)', (adapter) => {
  const db = useAdapter(adapter)
  const archive = () => db.stores.archive

  it('reads every deck by slug, trashed ones included, with its served markdown', async () => {
    await seedDeck(db.rows, 'zeta', { managed: true, unlisted: true, deletedAt: NOW })
    await seedDeck(db.rows, 'alpha', { alias: 'a', family: 'f' })
    await db.stores.content.writer.save({ slug: 'alpha', raw: '# alpha', actor: 'ana' })
    expect(await archive().decks()).toMatchObject([
      { slug: 'alpha', alias: 'a', family: 'f', managed: true, trashed: false, raw: '# alpha' },
      { slug: 'zeta', unlisted: true, managed: true, trashed: true, raw: null },
    ])
  })

  it('reads the projects by order then slug, and the historical aliases by alias', async () => {
    await db.rows.insert('projects', [
      { slug: 'b', title: 'B', order: 1, createdAt: NOW, updatedAt: NOW, deletedAt: NOW },
      { slug: 'a', title: 'A', order: 1, color: '#fff', createdAt: NOW, updatedAt: NOW },
      { slug: 'c', title: 'C', order: 0, createdAt: NOW, updatedAt: NOW },
    ])
    await seedDeck(db.rows, 'd')
    await db.rows.insert('deckAliases', [{ alias: 'z/old', deckSlug: 'd' }, { alias: 'a/old', deckSlug: 'd' }])
    expect(await archive().projects()).toEqual([
      { slug: 'c', title: 'C', order: 0, color: null },
      { slug: 'a', title: 'A', order: 1, color: '#fff' },
      { slug: 'b', title: 'B', order: 1, color: null },
    ])
    expect(await archive().aliases()).toEqual([{ alias: 'a/old', slug: 'd' }, { alias: 'z/old', slug: 'd' }])
  })

  it('applies projects, decks, versions and aliases in order, signed and dated', async () => {
    await db.rows.insert('projects', { slug: 'p', title: 'Old', order: 3, icon: 'star', createdAt: NOW, updatedAt: NOW })
    await archive().apply([
      { kind: 'project', project: { slug: 'p', title: 'P', order: 1, color: '#000' } },
      { kind: 'project', project: { slug: 'q', title: 'Q', order: 2, color: null } },
      { kind: 'deck', slug: 'd', axes: { title: 'D', status: 'public', project: 'p', unlisted: true } },
      { kind: 'version', slug: 'd', raw: '# d' },
      { kind: 'alias', alias: 'old/d', slug: 'd' },
      { kind: 'alias', alias: 'old/d', slug: 'd' },
    ], { by: 'content-import', at: AT })

    expect(await db.rows.select('projects', { slug: 'p' })).toMatchObject([{ title: 'P', order: 1, color: '#000', icon: 'star', createdAt: NOW, updatedAt: AT }])
    expect(await db.rows.select('projects', { slug: 'q' })).toMatchObject([{ title: 'Q', createdAt: AT }])
    const [deck] = await db.rows.select('decks', { slug: 'd' })
    expect(deck).toMatchObject({ title: 'D', status: 'public', project: 'p', unlisted: true, managed: true, createdAt: AT, updatedAt: AT })
    const [version] = await db.rows.select('deckVersions', { deckSlug: 'd' })
    expect(version).toMatchObject({ raw: '# d', publishedBy: 'content-import', publishedAt: AT })
    expect(deck!.publishedVersionId).toBe(version!.id)
    expect(await archive().aliases()).toEqual([{ alias: 'old/d', slug: 'd' }])
  })

  it('records the images a version cites in the media index', async () => {
    await archive().apply([
      { kind: 'deck', slug: 'd', axes: {} },
      { kind: 'version', slug: 'd', raw: '![](/images/team/a.png)\n\n![](/media/abc123.png)' },
    ], { by: 'content-import', at: AT })
    expect(await db.stores.mediaIndex.decksFor('images/team/a.png')).toEqual(['d'])
    expect(await db.stores.mediaIndex.decksFor('abc123.png')).toEqual(['d'])
  })

  it('updates only the given columns of a deck, titled by its slug when created without one', async () => {
    await seedDeck(db.rows, 'kept', { title: 'Kept', theme: 'dsfr', status: 'private' })
    await archive().apply([
      { kind: 'deck', slug: 'kept', axes: { theme: 'minimal' } },
      { kind: 'deck', slug: 'bare', axes: {} },
    ], { by: 'content-pull', at: AT })
    expect(await db.rows.select('decks', { slug: 'kept' })).toMatchObject([{ title: 'Kept', theme: 'minimal', status: 'private', managed: true }])
    expect(await db.rows.select('decks', { slug: 'bare' })).toMatchObject([{ title: 'bare', status: 'private', managed: true }])
  })

  it('writes nothing when one write fails', async () => {
    await expect(archive().apply([
      { kind: 'deck', slug: 'd', axes: { title: 'D' } },
      { kind: 'version', slug: 'ghost', raw: '# orphan' },
    ], { by: 'content-import', at: AT })).rejects.toThrow()
    expect(await db.rows.select('decks', { slug: 'd' })).toEqual([])
  })
})
