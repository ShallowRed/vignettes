import { beforeEach, describe, expect, it } from 'vitest'
import { ADAPTERS, useAdapter } from './helpers/adapters'

describe.each(ADAPTERS)('version history ($name)', (adapter) => {
  const db = useAdapter(adapter)
  const history = () => db.stores.versionHistory

  beforeEach(async () => {
    const { writer } = db.stores.content
    await writer.save({ slug: 'deck', raw: '# one', actor: 'ana', accessFromText: true })
    await writer.save({ slug: 'deck', raw: '# two, longer', actor: 'bob', accessFromText: true })
    await writer.save({ slug: 'other', raw: '# elsewhere', actor: 'ana', accessFromText: true })
  })

  it('lists the versions of one deck, newest first, and marks the served one', async () => {
    const versions = await history().list('deck')
    expect(versions.map(v => [v.kind, v.publishedBy, v.bytes, v.current])).toEqual([['version', 'bob', 13, true], ['version', 'ana', 5, false]])
    expect(versions[0]!.id).toBeGreaterThan(versions[1]!.id)
    expect(typeof versions[0]!.at).toBe('number')
  })

  it('lists nothing for a deck without versions', async () => {
    expect(await history().list('nope')).toEqual([])
  })

  it('loads a version with its markdown, only under its own deck', async () => {
    const [current, first] = await history().list('deck')
    expect(await history().load('deck', first!.id)).toMatchObject({ kind: 'version', raw: '# one', current: false })
    expect(await history().load('deck', current!.id)).toMatchObject({ raw: '# two, longer', current: true })
    expect(await history().load('other', first!.id)).toBeNull()
    expect(await history().load('deck', 999)).toBeNull()
  })
})
