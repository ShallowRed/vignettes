import { Buffer } from 'node:buffer'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDeckMeta } from '../../layers/studio/server/db/deck-meta'
import { deckAliases, deckDrafts, deckPermissions, decks, deckVersions } from '../../layers/studio/server/db/schema'
import { freshDb, NOW, seedDeck, seedUser } from './helpers/db'

describe('deck meta', () => {
  let db: ReturnType<typeof freshDb>
  let meta: ReturnType<typeof createDeckMeta>

  beforeEach(() => {
    db = freshDb()
    meta = createDeckMeta(db)
  })

  it('lists only managed rows, so draft anchors never shadow file stubs', async () => {
    seedDeck(db, 'anchor')
    seedDeck(db, 'curated', { status: 'public', managed: true })
    expect((await meta.listManaged()).map(d => d.slug)).toEqual(['curated'])
    expect(await meta.get('anchor')).toMatchObject({ managed: false, status: 'private' })
  })

  it('fails closed on an invalid stored status', async () => {
    seedDeck(db, 'd', { status: 'everyone', managed: true })
    expect((await meta.get('d'))!.status).toBe('private')
  })

  it('update makes the row managed, creating or patching it', async () => {
    const created = await meta.update('fresh', { status: 'public', alias: 'fresh-alias' })
    expect(created).toMatchObject({ slug: 'fresh', status: 'public', alias: 'fresh-alias', managed: true })
    const patched = await meta.update('fresh', { title: 'Fresh', unlisted: true })
    // A partial patch leaves earlier fields intact.
    expect(patched).toMatchObject({ title: 'Fresh', status: 'public', alias: 'fresh-alias', unlisted: true })
  })

  // The write guards (`assertCanEditDeck`, the collab upgrade) reject a trashed
  // deck via `isTrashed`; `get()` is null for both a missing and a trashed deck,
  // so the distinction lives here.
  it('trash lifecycle: hidden from reads, slug still reserved, restorable', async () => {
    expect(await meta.isTrashed('ghost')).toBe(false)
    await meta.update('deck', { title: 'Deck' })

    expect(await meta.softDelete('deck')).toBe(true)
    expect(await meta.isTrashed('deck')).toBe(true)
    expect(await meta.get('deck')).toBeNull()
    expect((await meta.listManaged()).map(d => d.slug)).not.toContain('deck')
    expect(await meta.existsIncludingTrashed('deck')).toBe(true)

    expect(await meta.restore('deck')).toBe(true)
    expect(await meta.isTrashed('deck')).toBe(false)
    expect((await meta.listManaged()).map(d => d.slug)).toContain('deck')
  })

  it('purge erases every trace of the deck and only that deck', async () => {
    seedUser(db, 7, 'ana')
    seedDeck(db, 'doomed', { managed: true })
    seedDeck(db, 'kept', { managed: true })
    const version = db.insert(deckVersions)
      .values({ deckSlug: 'doomed', raw: '# d', publishedBy: 'ana', publishedAt: NOW })
      .returning({ id: deckVersions.id })
      .get()!
    db.update(decks).set({ publishedVersionId: version.id }).where(eq(decks.slug, 'doomed')).run()
    db.insert(deckDrafts).values({ deckSlug: 'doomed', ydoc: Buffer.from([1]), updatedAt: NOW }).run()
    db.insert(deckAliases).values({ alias: 'old-path', deckSlug: 'doomed' }).run()
    db.insert(deckPermissions).values({ deckSlug: 'doomed', userId: 7, role: 'viewer', grantedBy: 'ana', createdAt: NOW }).run()

    await meta.softDelete('doomed')
    expect(await meta.purge('doomed')).toBe(true)
    expect(await meta.existsIncludingTrashed('doomed')).toBe(false)
    expect(await meta.isTrashed('doomed')).toBe(false)
    expect(db.select().from(deckVersions).all()).toEqual([])
    expect(db.select().from(deckDrafts).all()).toEqual([])
    expect(db.select().from(deckAliases).all()).toEqual([])
    expect(db.select().from(deckPermissions).all()).toEqual([])
    expect(await meta.get('kept')).not.toBeNull()

    expect(await meta.purge('ghost')).toBe(false)
  })
})
