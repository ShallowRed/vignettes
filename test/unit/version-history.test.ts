import { beforeEach, describe, expect, it } from 'vitest'
import { createDbContent } from '../../layers/studio/server/db/content-store'
import { createVersionHistory } from '../../layers/studio/server/db/version-history'
import { freshDb } from './helpers/db'

describe('createVersionHistory', () => {
  let db: ReturnType<typeof freshDb>
  let history: ReturnType<typeof createVersionHistory>

  beforeEach(async () => {
    db = freshDb()
    history = createVersionHistory(db)
    const { writer } = createDbContent(db)
    await writer.save({ slug: 'deck', raw: '# one', actor: 'ana' })
    await writer.save({ slug: 'deck', raw: '# two, longer', actor: 'bob' })
    await writer.save({ slug: 'other', raw: '# elsewhere', actor: 'ana' })
  })

  it('lists the versions of one deck, newest first, and marks the served one', async () => {
    const versions = await history.list('deck')
    expect(versions.map(v => [v.publishedBy, v.bytes, v.current])).toEqual([['bob', 13, true], ['ana', 5, false]])
    expect(versions[0]!.id).toBeGreaterThan(versions[1]!.id)
    expect(typeof versions[0]!.publishedAt).toBe('number')
  })

  it('lists nothing for a deck without versions', async () => {
    expect(await history.list('nope')).toEqual([])
  })

  it('loads a version with its markdown, only under its own deck', async () => {
    const [current, first] = await history.list('deck')
    expect(await history.load('deck', first!.id)).toMatchObject({ raw: '# one', current: false })
    expect(await history.load('deck', current!.id)).toMatchObject({ raw: '# two, longer', current: true })
    expect(await history.load('other', first!.id)).toBeNull()
    expect(await history.load('deck', 999)).toBeNull()
  })
})
