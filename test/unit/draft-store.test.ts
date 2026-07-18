import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDraftStore } from '../../server/db/draft-store'
import { decks } from '../../server/db/schema'
import { freshDb } from './helpers/db'

describe('createDraftStore', () => {
  let db: ReturnType<typeof freshDb>
  let store: ReturnType<typeof createDraftStore>

  beforeEach(() => {
    db = freshDb()
    store = createDraftStore(db)
  })

  it('returns null for a deck with no draft', async () => {
    expect(await store.load('nope')).toBeNull()
  })

  it('round-trips the Y.Doc binary', async () => {
    const bytes = new Uint8Array([0, 1, 128, 255, 42])
    await store.save('my-deck', bytes)
    expect(await store.load('my-deck')).toEqual(bytes)
  })

  it('overwrites on re-save (debounced snapshot semantics)', async () => {
    await store.save('my-deck', new Uint8Array([1]))
    await store.save('my-deck', new Uint8Array([2, 3]))
    expect(await store.load('my-deck')).toEqual(new Uint8Array([2, 3]))
  })

  it('anchors an unknown deck with fail-closed defaults', async () => {
    await store.save('brand-new', new Uint8Array([7]))
    const deck = db.select().from(decks).where(eq(decks.slug, 'brand-new')).get()!
    expect(deck.status).toBe('private')
    expect(deck.lifecycle).toBe('live')
  })

  it('does not clobber an existing deck row', async () => {
    const now = new Date()
    db.insert(decks).values({ slug: 'kept', title: 'Vrai titre', status: 'public', createdAt: now, updatedAt: now }).run()
    await store.save('kept', new Uint8Array([9]))
    const deck = db.select().from(decks).where(eq(decks.slug, 'kept')).get()!
    expect(deck.title).toBe('Vrai titre')
    expect(deck.status).toBe('public')
  })
})
