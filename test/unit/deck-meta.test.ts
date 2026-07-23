import { beforeEach, describe, expect, it } from 'vitest'
import { createDeckMeta } from '../../server/db/deck-meta'
import { freshDb } from './helpers/db'

// The write guard (`assertCanEditDeck`, collab upgrade) rejects a trashed deck
// via `isTrashed`. `get()` returns null both for a brand-new deck and a trashed
// one, so these cases pin the distinction the guard relies on.
describe('createDeckMeta.isTrashed', () => {
  let meta: ReturnType<typeof createDeckMeta>

  beforeEach(() => {
    meta = createDeckMeta(freshDb())
  })

  it('is false for a slug with no row', async () => {
    expect(await meta.isTrashed('ghost')).toBe(false)
  })

  it('tracks the trash lifecycle: live, trashed, restored', async () => {
    await meta.update('deck', { title: 'Deck' })
    expect(await meta.isTrashed('deck')).toBe(false)

    expect(await meta.softDelete('deck')).toBe(true)
    expect(await meta.isTrashed('deck')).toBe(true)
    // Trashed decks stay hidden from normal reads.
    expect(await meta.get('deck')).toBeNull()

    expect(await meta.restore('deck')).toBe(true)
    expect(await meta.isTrashed('deck')).toBe(false)
  })

  it('is false once the row is purged', async () => {
    await meta.update('deck', { title: 'Deck' })
    await meta.softDelete('deck')
    await meta.purge('deck')
    expect(await meta.isTrashed('deck')).toBe(false)
    expect(await meta.existsIncludingTrashed('deck')).toBe(false)
  })
})
