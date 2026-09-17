import { beforeEach, describe, expect, it } from 'vitest'
import { createSnapshotStore, snapshotsToDrop } from '../../layers/studio/server/db/snapshot-store'
import { freshDb, seedDeck } from './helpers/db'

const HOUR = 3_600_000
const DAY = 24 * HOUR
const now = Date.UTC(2026, 8, 17, 12)

describe('snapshotsToDrop', () => {
  const row = (id: number, age: number, label: string | null = null) => ({ id, createdAt: now - age, label })

  it('keeps the whole last day', () => {
    expect(snapshotsToDrop([row(1, 0), row(2, 5 * 60_000), row(3, 23 * HOUR)], now)).toEqual([])
  })

  it('keeps one snapshot per hour for a month, the most recent of the hour', () => {
    const rows = [row(1, 2 * DAY + 10 * 60_000), row(2, 2 * DAY + 20 * 60_000), row(3, 2 * DAY + 90 * 60_000)]
    expect(snapshotsToDrop(rows, now)).toEqual([2])
  })

  it('keeps one snapshot per day beyond a month', () => {
    const rows = [row(1, 40 * DAY + HOUR), row(2, 40 * DAY + 5 * HOUR), row(3, 41 * DAY + 2 * HOUR)]
    expect(snapshotsToDrop(rows, now)).toEqual([2])
  })

  it('never drops a labelled snapshot', () => {
    expect(snapshotsToDrop([row(1, 3 * DAY), row(2, 3 * DAY + 60_000, 'Avant relecture')], now)).toEqual([])
  })
})

describe('createSnapshotStore', () => {
  let db: ReturnType<typeof freshDb>
  let store: ReturnType<typeof createSnapshotStore>

  beforeEach(() => {
    db = freshDb()
    seedDeck(db, 'deck')
    store = createSnapshotStore(db)
  })

  it('adds and lists snapshots, newest first, with their authors', async () => {
    await store.add('deck', { raw: '# one', authors: ['ana'] })
    await store.add('deck', { raw: '# two', authors: ['ana', 'bob'], label: 'Relu' })
    const list = await store.list('deck')
    expect(list.map(s => [s.authors, s.label, s.bytes])).toEqual([[['ana', 'bob'], 'Relu', 5], [['ana'], null, 5]])
    expect(await store.latest('deck')).toMatchObject({ raw: '# two' })
    expect(await store.latest('other')).toBeNull()
  })

  it('loads a snapshot only under its own deck', async () => {
    seedDeck(db, 'other')
    const id = await store.add('deck', { raw: '# one', authors: [] })
    expect(await store.load('deck', id)).toMatchObject({ raw: '# one' })
    expect(await store.load('other', id)).toBeNull()
  })

  it('prunes the older snapshots of the deck on add', async () => {
    const at = (age: number) => new Date(now - age)
    await store.add('deck', { raw: 'a', authors: [], at: at(3 * DAY + 20 * 60_000) })
    await store.add('deck', { raw: 'b', authors: [], at: at(3 * DAY + 10 * 60_000) })
    await store.add('deck', { raw: 'c', authors: [], at: at(0) })
    expect((await store.list('deck')).map(s => s.bytes)).toHaveLength(2)
  })
})
