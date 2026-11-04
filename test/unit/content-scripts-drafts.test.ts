import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { markdownToYDocUpdate, sharesLineage, yDocUpdateToMarkdown } from '../../layers/studio/shared/collab/ydoc'
import { followDrafts } from '../../scripts/lib/follow-drafts'
import { ADAPTERS, useAdapter } from './helpers/adapters'

describe.each(ADAPTERS)('the drafts after a content script ($name)', (adapter) => {
  const db = useAdapter(adapter)

  it('follow the version they held, in their lineage, and keep other text', async () => {
    const { drafts, rewrites } = db.stores
    await drafts.create('held', markdownToYDocUpdate('# v1'))
    await drafts.create('edited', markdownToYDocUpdate('# v1 edited'))
    const before = (await drafts.load('held'))!
    const editedStamp = await drafts.stamp('edited')
    // A whole second: SQLite keeps the date to the second.
    const at = new Date(Math.ceil(Date.now() / 1000) * 1000 + 60_000)

    const followed = await followDrafts(rewrites, [
      { slug: 'held', previous: '# v1', next: '# v2' },
      { slug: 'edited', previous: '# v1', next: '# v2' },
      { slug: 'without-draft', previous: '# v1', next: '# v2' },
    ], at)
    expect(followed).toEqual(['held'])
    expect(await drafts.stamp('held')).toBe(at.getTime())
    expect(await drafts.stamp('edited')).toBe(editedStamp)
    const after = (await drafts.load('held'))!
    expect(yDocUpdateToMarkdown(after)).toBe('# v2')
    expect(sharesLineage(Y.encodeStateVectorFromUpdate(after), Y.encodeStateVectorFromUpdate(before))).toBe(true)
    expect(yDocUpdateToMarkdown((await drafts.load('edited'))!)).toBe('# v1 edited')
    expect(await drafts.load('without-draft')).toBeNull()
  })
})
