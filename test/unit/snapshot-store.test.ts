import { beforeEach, describe, expect, it } from 'vitest'
import { createSnapshotStore, MAX_LABELLED_SNAPSHOTS, MAX_RECENT_SNAPSHOTS, snapshotsToDrop } from '../../layers/studio/server/db/snapshot-store'
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

  it('changes rule exactly at one day and at thirty days', () => {
    // At one day the snapshot enters the hourly buckets; at thirty days the daily ones.
    expect(snapshotsToDrop([row(1, DAY - 60_000), row(2, DAY - 120_000)], now)).toEqual([])
    expect(snapshotsToDrop([row(1, DAY + 10 * 60_000), row(2, DAY + 20 * 60_000)], now)).toEqual([2])
    expect(snapshotsToDrop([row(1, 30 * DAY), row(2, 30 * DAY + 2 * HOUR)], now)).toEqual([2])
    expect(snapshotsToDrop([row(1, 30 * DAY - HOUR), row(2, 30 * DAY - 2 * HOUR)], now)).toEqual([])
  })

  it('caps the labelled snapshots and the ones of the last day, dropping the oldest', () => {
    const labelled = Array.from({ length: MAX_LABELLED_SNAPSHOTS + 2 }, (_, i) => row(i + 1, i * 60_000, `n${i}`))
    expect(snapshotsToDrop(labelled, now)).toEqual([MAX_LABELLED_SNAPSHOTS + 1, MAX_LABELLED_SNAPSHOTS + 2])
    const recent = Array.from({ length: MAX_RECENT_SNAPSHOTS + 1 }, (_, i) => row(i + 1, i * 1000))
    expect(snapshotsToDrop(recent, now)).toEqual([MAX_RECENT_SNAPSHOTS + 1])
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
    await store.add('deck', { raw: 'aa', authors: [], at: at(3 * DAY + 20 * 60_000) })
    await store.add('deck', { raw: 'b', authors: [], at: at(3 * DAY + 10 * 60_000) })
    await store.add('deck', { raw: 'ccc', authors: [], at: at(0) })
    expect((await store.list('deck')).map(s => s.bytes)).toEqual([3, 1])
  })
})
