import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { ADAPTERS, NOW, seedDeck, seedUser, useAdapter } from './helpers/adapters'

const LATER = new Date(NOW.getTime() + 60_000)

describe.each(ADAPTERS)('catalog reads ($name)', (adapter) => {
  const db = useAdapter(adapter)
  const catalog = () => db.stores.catalog

  async function publish(slug: string, raw: string, at = NOW) {
    const [version] = await db.rows.insert('deckVersions', { deckSlug: slug, raw, publishedBy: 'ana', publishedAt: at })
    await db.rows.update('decks', { publishedVersionId: version!.id }, { slug })
    return version!.id
  }

  it('counts the grants of each deck and project, expired ones included', async () => {
    await seedUser(db.rows, 1, 'alice')
    await seedUser(db.rows, 2, 'bob')
    await seedDeck(db.rows, 'a')
    await db.rows.insert('projects', { slug: 'p', title: 'P', createdAt: NOW, updatedAt: NOW })
    await db.stores.deckGrants.set('a', 1, 'viewer', 'lucas')
    await db.stores.deckGrants.set('a', 2, 'editor', 'lucas', new Date(Date.now() - 1000))
    await db.stores.projectGrants.set('p', 1, 'viewer', 'lucas')
    expect(await catalog().deckGrantCounts()).toEqual(new Map([['a', 2]]))
    expect(await catalog().projectGrantCounts()).toEqual(new Map([['p', 1]]))
  })

  it('names the decks whose draft was saved since their publication', async () => {
    for (const slug of ['ahead', 'behind', 'draft-only'])
      await seedDeck(db.rows, slug)
    await publish('ahead', '# a', NOW)
    await publish('behind', '# b', LATER)
    await db.rows.insert('deckDrafts', [
      { deckSlug: 'ahead', ydoc: Buffer.from([1]), updatedAt: NOW },
      { deckSlug: 'behind', ydoc: Buffer.from([1]), updatedAt: NOW },
      { deckSlug: 'draft-only', ydoc: Buffer.from([1]), updatedAt: LATER },
    ])
    expect(await catalog().draftsSincePublish()).toEqual(['ahead'])
  })

  it('dates every published deck, trashed ones included, and reads their versions', async () => {
    await seedDeck(db.rows, 'live')
    await seedDeck(db.rows, 'binned', { deletedAt: NOW })
    await seedDeck(db.rows, 'unpublished')
    const live = await publish('live', '# live', LATER)
    const binned = await publish('binned', '# binned')
    await db.rows.insert('deckDrafts', { deckSlug: 'live', ydoc: Buffer.from([1]), updatedAt: LATER })

    const decks = (await catalog().publishedDecks()).sort((a, b) => a.slug.localeCompare(b.slug))
    expect(decks.map(d => [d.slug, d.versionId, d.updatedAt.getTime(), d.publishedAt.getTime(), d.draftSavedAt?.getTime() ?? null])).toEqual([
      ['binned', binned, NOW.getTime(), NOW.getTime(), null],
      ['live', live, NOW.getTime(), LATER.getTime(), LATER.getTime()],
    ])
    const texts = (await catalog().versionTexts([live, binned, 999])).sort((a, b) => a.id - b.id)
    expect(texts).toEqual([{ id: live, raw: '# live' }, { id: binned, raw: '# binned' }].sort((a, b) => a.id - b.id))
    expect(await catalog().versionTexts([])).toEqual([])
  })
})
