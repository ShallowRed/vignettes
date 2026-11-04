import { Document } from '@hocuspocus/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { noteContributor, recordDraftSnapshot, SNAPSHOT_INTERVAL_MS, useCollabServer, useDraftStore, useSnapshotStore, writeDraftText } from '../../layers/studio/server/utils/collab'
import { replaceText } from '../../layers/studio/shared/collab/ydoc'
import { asUser, seedAccount, setupServerDb, stubH3Globals } from './helpers/server-db'

// The fine history of the draft: what the collab hooks and the solo save keep.
stubH3Globals()
setupServerDb()

const { default: saveDraft } = await import('../../layers/studio/server/api/presentations/[slug].put')

const hooks = () => useCollabServer().configuration
const editor = (over: Record<string, unknown>) => asUser(3, 'ed', over)

// One room per test, as Hocuspocus keeps one per deck: its stores share the
// lineage of the stored draft.
let shared = new Document('deck')
function room(text: string) {
  replaceText(shared.getText('codemirror'), text)
  return shared
}
function change(user: string) {
  return hooks().onChange!({ documentName: 'deck', document: new Document('deck'), context: { deck: 'deck', user } } as any)
}
async function store(doc: Document, clientsCount: number) {
  await useDraftStore().create('deck', Y.encodeStateAsUpdate(new Y.Doc()))
  await hooks().onStoreDocument!({ documentName: 'deck', document: doc as any, clientsCount, lastContext: { deck: 'deck' }, lastTransactionOrigin: null, instance: useCollabServer() })
}

beforeEach(async () => {
  shared = new Document('deck')
  await seedAccount(3, 'ed', 'editor')
  useCollabServer().documents.delete('deck')
})
afterEach(() => {
  vi.useRealTimers()
})

describe('snapshots while people edit', () => {
  it('keeps the first store, then waits the interval, with the logins that edited', async () => {
    await change('ana')
    await change('bob')
    await store(room('# one'), 2)
    expect(await useSnapshotStore().list('deck')).toMatchObject([{ authors: ['ana', 'bob'] }])

    await change('ana')
    await store(room('# two'), 2)
    expect(await useSnapshotStore().list('deck')).toHaveLength(1)

    vi.useFakeTimers({ now: Date.now() + SNAPSHOT_INTERVAL_MS + 1 })
    await store(room('# two'), 2)
    expect((await useSnapshotStore().list('deck')).map(s => s.authors)).toEqual([['ana'], ['ana', 'bob']])
  })

  it('keeps the final state when the last editor leaves, and nothing when the text did not move', async () => {
    await store(room('# one'), 1)
    await store(room('# one, then'), 0)
    expect((await useSnapshotStore().list('deck')).map(s => s.bytes)).toEqual([11, 5])
    await store(room('# one, then'), 0)
    expect(await useSnapshotStore().list('deck')).toHaveLength(2)
  })

  it('keeps a snapshot on each solo save', async () => {
    await saveDraft(editor({ params: { slug: 'deck' }, body: { raw: '# v1', stamp: null } }))
    await saveDraft(editor({ params: { slug: 'deck' }, body: { raw: '# v2' } }))
    expect((await useSnapshotStore().list('deck')).map(s => s.authors)).toEqual([['ed'], ['ed']])
  })
})

describe('recordDraftSnapshot', () => {
  it('names the contributors noted since the last snapshot, then forgets them', async () => {
    await writeDraftText('deck', '# x')
    noteContributor('deck', 'ana')
    noteContributor('deck', null)
    expect(await recordDraftSnapshot('deck', '# x', { by: 'ed', force: true })).toEqual(expect.any(Number))
    expect(await recordDraftSnapshot('deck', '# y', { force: true })).toEqual(expect.any(Number))
    expect((await useSnapshotStore().list('deck')).map(s => s.authors)).toEqual([[], ['ana', 'ed']])
  })
})
