import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { ADAPTERS, NOW, seedDeck, seedUser, useAdapter } from './helpers/adapters'

describe.each(ADAPTERS)('deck meta ($name)', (adapter) => {
  const db = useAdapter(adapter)
  const meta = () => db.stores.deckMeta

  it('lists only managed rows, so draft anchors never shadow file stubs', async () => {
    await seedDeck(db.rows, 'anchor')
    await seedDeck(db.rows, 'curated', { status: 'public', managed: true })
    expect((await meta().listManaged()).map(d => d.slug)).toEqual(['curated'])
    expect(await meta().get('anchor')).toMatchObject({ managed: false, status: 'private' })
  })

  it('fails closed on an invalid stored status', async () => {
    await seedDeck(db.rows, 'd', { status: 'everyone', managed: true })
    expect((await meta().get('d'))!.status).toBe('private')
  })

  it('replaces a password hash still in place, and leaves updatedAt as it is', async () => {
    await seedDeck(db.rows, 'd', { managed: true, accessPasswordHash: 'old', updatedAt: NOW })
    await expect(meta().replacePasswordHash('d', 'other', 'new')).resolves.toBe(false)
    await expect(meta().replacePasswordHash('d', 'old', 'new')).resolves.toBe(true)
    expect((await db.rows.select('decks', { slug: 'd' }))[0]).toMatchObject({ accessPasswordHash: 'new', updatedAt: NOW })
  })

  it('update makes the row managed, creating or patching it', async () => {
    const created = await meta().update('fresh', { status: 'public', alias: 'fresh-alias' })
    expect(created).toMatchObject({ slug: 'fresh', status: 'public', alias: 'fresh-alias', managed: true })
    const patched = await meta().update('fresh', { title: 'Fresh', unlisted: true })
    // A partial patch leaves earlier fields intact.
    expect(patched).toMatchObject({ title: 'Fresh', status: 'public', alias: 'fresh-alias', unlisted: true })
  })

  // The write guards (`assertCanEditDeck`, the collab upgrade) reject a trashed
  // deck via `isTrashed`; `get()` is null for both a missing and a trashed deck,
  // so the distinction lives here.
  it('trash lifecycle: hidden from reads, slug still reserved, restorable', async () => {
    expect(await meta().isTrashed('ghost')).toBe(false)
    await meta().update('deck', { title: 'Deck' })

    expect(await meta().softDelete('deck')).toBe(true)
    expect(await meta().isTrashed('deck')).toBe(true)
    expect(await meta().get('deck')).toBeNull()
    expect((await meta().listManaged()).map(d => d.slug)).not.toContain('deck')
    expect(await meta().existsIncludingTrashed('deck')).toBe(true)

    expect(await meta().restore('deck')).toBe(true)
    expect(await meta().isTrashed('deck')).toBe(false)
    expect((await meta().listManaged()).map(d => d.slug)).toContain('deck')
  })

  it('purge erases every trace of the deck and only that deck', async () => {
    await seedUser(db.rows, 7, 'ana')
    await seedDeck(db.rows, 'doomed', { managed: true })
    await seedDeck(db.rows, 'kept', { managed: true })
    const [version] = await db.rows.insert('deckVersions', { deckSlug: 'doomed', raw: '# d', publishedBy: 'ana', publishedAt: NOW })
    await db.rows.update('decks', { publishedVersionId: version!.id }, { slug: 'doomed' })
    await db.rows.insert('deckDrafts', { deckSlug: 'doomed', ydoc: Buffer.from([1]), updatedAt: NOW })
    await db.rows.insert('deckAliases', { alias: 'old-path', deckSlug: 'doomed' })
    await db.rows.insert('deckPermissions', { deckSlug: 'doomed', userId: 7, role: 'viewer', grantedBy: 'ana', createdAt: NOW })

    await meta().softDelete('doomed')
    expect(await meta().purge('doomed')).toBe(true)
    expect(await meta().existsIncludingTrashed('doomed')).toBe(false)
    expect(await meta().isTrashed('doomed')).toBe(false)
    expect(await db.rows.select('deckVersions')).toEqual([])
    expect(await db.rows.select('deckDrafts')).toEqual([])
    expect(await db.rows.select('deckAliases')).toEqual([])
    expect(await db.rows.select('deckPermissions')).toEqual([])
    expect(await meta().get('kept')).not.toBeNull()

    expect(await meta().purge('ghost')).toBe(false)
  })

  it('reads the project of a deck, trashed decks included', async () => {
    await seedDeck(db.rows, 'filed', { project: 'client' })
    await seedDeck(db.rows, 'loose')
    await seedDeck(db.rows, 'binned', { project: 'client', deletedAt: NOW })
    expect(await meta().projectOf('filed')).toBe('client')
    expect(await meta().projectOf('binned')).toBe('client')
    expect(await meta().projectOf('loose')).toBeNull()
    expect(await meta().projectOf('ghost')).toBeNull()
    expect(await meta().projectsBySlug()).toEqual(new Map([['binned', 'client'], ['filed', 'client'], ['loose', null]]))
  })
})
