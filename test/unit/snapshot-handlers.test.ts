import { beforeEach, describe, expect, it } from 'vitest'
import { useDraftStore, useSnapshotStore } from '../../layers/studio/server/utils/collab'
import { useDbContent } from '../../layers/studio/server/utils/sources'
import { markdownToYDocUpdate, yDocUpdateToMarkdown } from '../../layers/studio/shared/collab/ydoc'
import { asUser, seedAccount, setupServerDb, stubH3Globals } from './helpers/server-db'

// The snapshot routes: the merged history, a named snapshot, and what a
// restore leaves behind.
stubH3Globals()
setupServerDb()

const { default: listHistory } = await import('../../layers/studio/server/api/presentations/[slug]/history.get')
const { default: keepSnapshot } = await import('../../layers/studio/server/api/presentations/[slug]/snapshots.post')
const { default: loadSnapshot } = await import('../../layers/studio/server/api/presentations/[slug]/snapshots/[id].get')
const { default: restoreSnapshot } = await import('../../layers/studio/server/api/presentations/[slug]/snapshots/[id]/restore.post')
const { default: restoreVersion } = await import('../../layers/studio/server/api/presentations/[slug]/versions/[id]/restore.post')

const editor = (over: Record<string, unknown>) => asUser(3, 'ed', over)
const params = (id?: number) => ({ params: { slug: 'deck', ...(id === undefined ? {} : { id: String(id) }) } })

beforeEach(async () => {
  await seedAccount(3, 'ed', 'editor')
})

describe('the snapshot routes', () => {
  it('lists snapshots and versions together, newest first', async () => {
    await useDbContent().writer.save({ slug: 'deck', raw: '# published', actor: 'ed' })
    await useDraftStore().save('deck', markdownToYDocUpdate('# draft'))
    await keepSnapshot(editor({ params: { slug: 'deck' }, body: { label: 'Relu' } }))
    const { entries } = await listHistory(editor(params()))
    expect(entries.map(e => e.kind)).toEqual(['snapshot', 'version'])
    expect(entries[0]).toMatchObject({ label: 'Relu', authors: ['ed'] })
  })

  it('refuses a label that is too long, and a deck without a draft', async () => {
    await expect(keepSnapshot(editor({ params: { slug: 'deck' }, body: { label: 'x'.repeat(81) } }))).rejects.toMatchObject({ statusCode: 400 })
    await expect(keepSnapshot(editor({ params: { slug: 'deck' }, body: {} }))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('loads a snapshot with its text and restores it, keeping the replaced draft', async () => {
    await useDraftStore().save('deck', markdownToYDocUpdate('# first'))
    const { id } = await keepSnapshot(editor({ params: { slug: 'deck' }, body: {} }))
    await useDraftStore().save('deck', markdownToYDocUpdate('# second'))
    await expect(loadSnapshot(editor(params(id!)))).resolves.toMatchObject({ kind: 'snapshot', raw: '# first' })

    await restoreSnapshot(editor(params(id!)))
    expect(yDocUpdateToMarkdown((await useDraftStore().load('deck'))!)).toBe('# first')
    const list = await useSnapshotStore().list('deck')
    expect(list).toHaveLength(2)
    expect(await useSnapshotStore().load('deck', list[0]!.id)).toMatchObject({ raw: '# second', authors: ['ed'] })
  })

  it('keeps the replaced draft when a version is restored too', async () => {
    await useDbContent().writer.save({ slug: 'deck', raw: '# published', actor: 'ed' })
    await useDraftStore().save('deck', markdownToYDocUpdate('# unpublished work'))
    const { entries } = await listHistory(editor(params()))
    await restoreVersion(editor(params(entries[0]!.id)))
    expect(await useSnapshotStore().latest('deck')).toMatchObject({ raw: '# unpublished work' })
  })
})
