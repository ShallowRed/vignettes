import { describe, expect, it } from 'vitest'
import { ADAPTERS, useAdapter } from './helpers/adapters'

describe.each(ADAPTERS)('draft store ($name)', (adapter) => {
  const db = useAdapter(adapter)
  const store = () => db.stores.drafts
  const deck = async (slug: string) => (await db.rows.select('decks', { slug }))[0]!

  it('returns null for a deck with no draft', async () => {
    expect(await store().load('nope')).toBeNull()
  })

  it('round-trips the Y.Doc binary', async () => {
    const bytes = new Uint8Array([0, 1, 128, 255, 42])
    await store().create('my-deck', bytes)
    expect(await store().load('my-deck')).toEqual(bytes)
  })

  it('writes what the merge returns from the stored draft, and nothing when it throws', async () => {
    await store().create('my-deck', new Uint8Array([1]))
    await store().update('my-deck', stored => new Uint8Array([...stored!, 2, 3]))
    expect(await store().load('my-deck')).toEqual(new Uint8Array([1, 2, 3]))
    await expect(store().update('my-deck', () => {
      throw new Error('refused')
    })).rejects.toThrow('refused')
    expect(await store().load('my-deck')).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('creates the first draft only, and says which call wrote it', async () => {
    expect(await store().create('first', new Uint8Array([1]))).toBe(true)
    expect(await store().create('first', new Uint8Array([2]))).toBe(false)
    expect(await store().load('first')).toEqual(new Uint8Array([1]))
    expect((await deck('first')).status).toBe('private')
  })

  it('anchors an unknown deck with fail-closed defaults', async () => {
    await store().create('brand-new', new Uint8Array([7]))
    const row = await deck('brand-new')
    expect(row.status).toBe('private')
    expect(row.lifecycle).toBe('live')
  })

  it('does not clobber an existing deck row', async () => {
    const now = new Date()
    await db.rows.insert('decks', { slug: 'kept', title: 'Vrai titre', status: 'public', createdAt: now, updatedAt: now })
    await store().create('kept', new Uint8Array([9]))
    const row = await deck('kept')
    expect(row.title).toBe('Vrai titre')
    expect(row.status).toBe('public')
  })
})
