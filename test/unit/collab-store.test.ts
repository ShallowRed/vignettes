import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { useCollabServer, useDraftStore } from '../../server/utils/collab'
import { useDbContent } from '../../server/utils/sources'
import { yDocUpdateToMarkdown } from '../../shared/collab/ydoc'
import { setupServerDb, stubH3Globals } from './helpers/server-db'

// Drive the Hocuspocus hooks the way the server does, with the payload shapes
// of the installed version. The store hook once refused every save because it
// checked a field the payload does not carry: every collab edit was lost when
// the room closed.
stubH3Globals()
setupServerDb()

const server = () => useCollabServer()
const hooks = () => server().configuration
function doc(text: string) {
  const ydoc = new Y.Doc()
  ydoc.getText('codemirror').insert(0, text)
  return ydoc
}

describe('collab document hooks', () => {
  it('persists the room as the deck draft when Hocuspocus stores it', async () => {
    await hooks().onStoreDocument!({ documentName: 'deck', document: doc('# live') as any, lastContext: { deck: 'deck' }, clientsCount: 0, lastTransactionOrigin: null, instance: server() })
    const stored = await useDraftStore().load('deck')
    expect(stored && yDocUpdateToMarkdown(stored)).toBe('# live')
  })

  it('seeds an empty room from the published text, only for the pinned deck', async () => {
    await useDbContent().writer.save({ slug: 'deck', raw: '# published', actor: 'ed' })
    const pinned = new Y.Doc()
    await hooks().onLoadDocument!({ documentName: 'deck', document: pinned as any, context: { deck: 'deck' } } as any)
    expect(pinned.getText('codemirror').toString()).toBe('# published')

    const other = new Y.Doc()
    await hooks().onLoadDocument!({ documentName: 'deck', document: other as any, context: { deck: 'another' } } as any)
    expect(other.getText('codemirror').toString()).toBe('')
  })

  it('closes a socket that sends updates for a deck it was not authorized for', async () => {
    await expect(hooks().beforeHandleMessage!({ documentName: 'deck', context: { deck: 'another' } } as any)).rejects.toThrow(/not authorized/)
    await expect(hooks().beforeHandleMessage!({ documentName: 'deck', context: { deck: 'deck' } } as any)).resolves.toBeUndefined()
  })
})
