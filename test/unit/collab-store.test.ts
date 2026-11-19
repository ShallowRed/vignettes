import { IncomingMessage, MessageType, OutgoingMessage } from '@hocuspocus/server'
import { MAX_DECK_LENGTH } from '@vignettes/core/deck'
import { describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { hasRoom, MAX_DRAFT_BYTES, STORE_RETRY_MS, storePendingRooms, useCollabServer, useDraftStore, useSnapshotStore } from '../../layers/studio/server/utils/collab'
import { useStores } from '../../layers/studio/server/utils/db'
import { useContentArchive, useDbContent, useDeckMeta } from '../../layers/studio/server/utils/sources'
import { yDocUpdateToMarkdown } from '../../layers/studio/shared/collab/ydoc'
import { captureError, setupServerDb, stubH3Globals } from './helpers/server-db'

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

// A connection of a room that logs, in order, the close event it receives and
// the close of its socket.
function connectionLog(log: unknown[]) {
  return { close: (event: unknown) => log.push(event), webSocket: { close: () => log.push('socket closed') } }
}

describe('collab document hooks', () => {
  it('persists the room as the deck draft when Hocuspocus stores it', async () => {
    await useDraftStore().create('deck', Y.encodeStateAsUpdate(new Y.Doc()))
    await hooks().onStoreDocument!({ documentName: 'deck', document: doc('# live') as any, lastContext: { deck: 'deck' }, clientsCount: 0, lastTransactionOrigin: null, instance: server() })
    const stored = await useDraftStore().load('deck')
    expect(stored && yDocUpdateToMarkdown(stored)).toBe('# live')
  })

  it('seeds an empty room from the published text and stores it before a client receives it', async () => {
    await useDbContent().writer.save({ slug: 'deck', raw: '# published', actor: 'ed' })
    const room = new Y.Doc()
    await hooks().onLoadDocument!({ documentName: 'deck', document: room as any, context: { deck: 'deck' } } as any)
    expect(room.getText('codemirror').toString()).toBe('# published')
    const stored = await useDraftStore().load('deck')
    expect(stored && yDocUpdateToMarkdown(stored)).toBe('# published')
    expect(Y.encodeStateVector(room)).toEqual(Y.encodeStateVectorFromUpdate(stored!))
  })

  it('refuses a connection to another document than the pinned deck, for that connection only', async () => {
    await expect(hooks().onAuthenticate!({ documentName: 'deck', context: { deck: 'another' } } as any)).rejects.toMatchObject({ reason: 'not-pinned' })
    await expect(hooks().onAuthenticate!({ documentName: 'deck', context: { deck: 'deck' } } as any)).resolves.toBeUndefined()
  })

  it('keeps no room for a deck with neither draft nor published version, nor for a seed past the limit', async () => {
    const load = (documentName: string) => hooks().onLoadDocument!({ documentName, document: new Y.Doc() as any, context: { deck: documentName } } as any)
    await expect(load('nothing-here')).rejects.toMatchObject({ reason: 'deck-not-found' })
    await expect(load('Not a slug!')).rejects.toMatchObject({ reason: 'deck-not-found' })
    const at = new Date()
    await useContentArchive().apply([
      { kind: 'deck', slug: 'long', axes: { title: 'Long', status: 'private', lifecycle: 'live', project: null, theme: null, accessPasswordHash: null, unlisted: false } },
      { kind: 'version', slug: 'long', raw: 'x'.repeat(MAX_DECK_LENGTH + 1) },
    ], { by: 'content-push', at })
    await expect(load('long')).rejects.toMatchObject({ reason: 'deck-too-long' })
    expect(await useDraftStore().load('long')).toBeNull()

    await useDbContent().writer.save({ slug: 'trashed', raw: '# trashed', actor: 'ed' })
    await useDeckMeta().softDelete('trashed')
    await expect(load('trashed')).rejects.toMatchObject({ reason: 'deck-not-found' })
    expect(await useDraftStore().load('trashed')).toBeNull()

    await expect(server().openDirectConnection('nothing-here', { deck: 'nothing-here' })).rejects.toMatchObject({ reason: 'deck-not-found' })
    expect(hasRoom('nothing-here')).toBe(false)
  })

  it('loads a stored draft without its pending parts', async () => {
    await useDbContent().writer.save({ slug: 'lineage-7', raw: '# v1', actor: 'ed' })
    const direct = await useCollabServer().openDirectConnection('lineage-7', { deck: 'lineage-7' })
    const draft = new Y.Doc()
    Y.applyUpdate(draft, Y.encodeStateAsUpdate(direct.document!))
    await direct.disconnect()
    const tab = new Y.Doc()
    Y.applyUpdate(tab, Y.encodeStateAsUpdate(draft))
    tab.getText('codemirror').insert(0, 'a')
    const withheld = Y.encodeStateVector(tab)
    tab.getText('codemirror').insert(1, 'b')
    Y.applyUpdate(draft, Y.encodeStateAsUpdate(tab, withheld))
    expect(draft.store.pendingStructs).not.toBeNull()
    const room = new Y.Doc()
    await useDraftStore().save('lineage-7', Y.encodeStateAsUpdate(draft))
    await hooks().onLoadDocument!({ documentName: 'lineage-7', document: room as any, context: { deck: 'lineage-7' } } as any)
    expect(room.store.pendingStructs).toBeNull()
    expect(room.getText('codemirror').toString()).toBe('# v1')
  })

  it('counts a room that is still loading as open', async () => {
    await useDbContent().writer.save({ slug: 'deck', raw: '# published', actor: 'ed' })
    const opening = server().openDirectConnection('deck', { deck: 'deck' })
    expect(server().documents.has('deck')).toBe(false)
    expect(hasRoom('deck')).toBe(true)
    await (await opening).disconnect()
    expect(hasRoom('deck')).toBe(false)
  })

  it('creates the draft once when two loads race, as two containers do, and both rooms hold that one lineage', async () => {
    await useDbContent().writer.save({ slug: 'deck', raw: '# published', actor: 'ed' })
    const [a, b] = [new Y.Doc(), new Y.Doc()]
    await Promise.all([a, b].map(document => hooks().onLoadDocument!({ documentName: 'deck', document: document as any, context: { deck: 'deck' } } as any)))
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b))
    expect(a.getText('codemirror').toString()).toBe('# published')
  })

  it.each([
    ['with the same published version', '# v1'],
    ['after a new published version', '# v2'],
  ])('gives a tab kept across an unload one copy of the text, %s', async (_, republished) => {
    await useDbContent().writer.save({ slug: 'deck', raw: '# v1', actor: 'ed' })
    const first = await server().openDirectConnection('deck', { deck: 'deck' })
    const tab = new Y.Doc()
    Y.applyUpdate(tab, Y.encodeStateAsUpdate(first.document!))
    await first.disconnect()
    expect(server().documents.has('deck')).toBe(false)

    await useDbContent().writer.save({ slug: 'deck', raw: republished, actor: 'content-push' })
    const second = await server().openDirectConnection('deck', { deck: 'deck' })
    Y.applyUpdate(second.document!, Y.encodeStateAsUpdate(tab, Y.encodeStateVector(second.document!)))
    Y.applyUpdate(tab, Y.encodeStateAsUpdate(second.document!, Y.encodeStateVector(tab)))
    expect(second.document!.getText('codemirror').toString()).toBe('# v1')
    expect(tab.getText('codemirror').toString()).toBe('# v1')
    await second.disconnect()
  })

  it('closes the connections of a room past the deck limit, and stores none of it', async () => {
    const closed: unknown[] = []
    const large = Object.assign(doc('x'.repeat(MAX_DECK_LENGTH + 1)), { getConnections: () => [connectionLog(closed)] })
    await hooks().onChange!({ documentName: 'big', document: large as any, context: { deck: 'big' } } as any)
    expect(closed).toEqual([expect.objectContaining({ reason: 'Deck too long' }), 'socket closed'])
    await hooks().onStoreDocument!({ documentName: 'big', document: large as any, lastContext: { deck: 'big' }, clientsCount: 0, lastTransactionOrigin: null, instance: server() })
    expect(await useDraftStore().load('big')).toBeNull()
  })

  it('closes the connections of a room past the draft size, and stores none of it', async () => {
    const closed: unknown[] = []
    const heavy = Object.assign(doc('# heavy'), { getConnections: () => [connectionLog(closed)] })
    heavy.getMap('other').set('key', 'x'.repeat(MAX_DRAFT_BYTES))
    await hooks().onStoreDocument!({ documentName: 'heavy', document: heavy as any, lastContext: { deck: 'heavy' }, clientsCount: 0, lastTransactionOrigin: null, instance: server() } as any)
    expect(closed).toEqual([expect.objectContaining({ reason: 'Deck too long' }), 'socket closed'])
    expect(await useDraftStore().load('heavy')).toBeNull()
  })

  it('keeps the text of a room of another lineage in the history, closes it, and leaves the stored draft', async () => {
    await useDbContent().writer.save({ slug: 'deck', raw: '# v1', actor: 'ed' })
    await (await server().openDirectConnection('deck', { deck: 'deck' })).disconnect()
    const closed: unknown[] = []
    const foreign = Object.assign(doc('# foreign'), { getConnections: () => [connectionLog(closed)] })
    await hooks().onStoreDocument!({ documentName: 'deck', document: foreign as any, lastContext: { deck: 'deck' }, clientsCount: 1, lastTransactionOrigin: null, instance: server() } as any)
    expect(yDocUpdateToMarkdown((await useDraftStore().load('deck'))!)).toBe('# v1')
    expect(await useSnapshotStore().latest('deck')).toMatchObject({ raw: '# foreign' })
    expect(closed).toEqual([expect.objectContaining({ reason: 'Draft lineage' }), 'socket closed'])
  })

  it('stores an edited room before its save debounce ends, for a server that stops', async () => {
    await useDbContent().writer.save({ slug: 'room', raw: '# room', actor: 'ed' })
    const connection = await server().openDirectConnection('room', { deck: 'room' })
    await connection.transact(document => document.getText('codemirror').insert(0, '# edited\n'))
    const seeded = await useDraftStore().load('room')
    expect(seeded && yDocUpdateToMarkdown(seeded)).toBe('# room')
    await storePendingRooms()
    const stored = await useDraftStore().load('room')
    expect(stored && yDocUpdateToMarkdown(stored)).toBe('# edited\n# room')
    await connection.disconnect()
  })
})

describe('a room whose store fails after its last editor leaves', () => {
  async function failedRoom(slug: string, failures = 1) {
    await useDbContent().writer.save({ slug, raw: '# room', actor: 'ed' })
    const connection = await server().openDirectConnection(slug, { deck: slug })
    await connection.transact(document => document.getText('codemirror').insert(0, '# edited\n'))
    captureError.mockClear()
    const update = vi.spyOn(useStores().drafts, 'update')
    for (let i = 0; i < failures; i++)
      update.mockRejectedValueOnce(new Error('disk full'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    // The last tab closes, and its store runs once the debounce ends.
    await connection.disconnect({ unloadImmediately: false })
    await server().debouncer.executeNow(`onStoreDocument-${slug}`)
    expect(server().documents.has(slug)).toBe(true)
    expect(yDocUpdateToMarkdown((await useDraftStore().load(slug))!)).toBe('# room')
  }

  it('reports the error, and stores the room at the next try', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      await failedRoom('retried')
      expect(captureError).toHaveBeenCalledWith(expect.objectContaining({ message: 'disk full' }), { tags: ['collab'] })
      await vi.advanceTimersByTimeAsync(STORE_RETRY_MS)
      await vi.waitFor(async () => expect(yDocUpdateToMarkdown((await useDraftStore().load('retried'))!)).toBe('# edited\n# room'))
      await vi.waitFor(() => expect(server().documents.has('retried')).toBe(false))
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('keeps the room in memory while its stores fail, and reports the first failure only', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      await failedRoom('failing', 2)
      await vi.advanceTimersByTimeAsync(STORE_RETRY_MS)
      expect(server().documents.has('failing')).toBe(true)
      expect(yDocUpdateToMarkdown((await useDraftStore().load('failing'))!)).toBe('# room')
      expect(captureError).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(STORE_RETRY_MS)
      await vi.waitFor(async () => expect(yDocUpdateToMarkdown((await useDraftStore().load('failing'))!)).toBe('# edited\n# room'))
      await vi.waitFor(() => expect(server().documents.has('failing')).toBe(false))
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('stores the room when the server stops', async () => {
    await failedRoom('stopped')
    await storePendingRooms()
    expect(yDocUpdateToMarkdown((await useDraftStore().load('stopped'))!)).toBe('# edited\n# room')
  })
})

// A tab speaks to the server as @hocuspocus/provider does: an authentication
// message, then its sync step 1, then its updates. The fake socket keeps what
// the server sends back.
describe('a tab that holds another lineage of the draft', () => {
  // The authentication message of the provider, with an empty token: the name
  // of the document, then the type `Auth` and the subtype `Token` (0), each
  // under 128 and so one byte each in the variable-length encoding.
  const auth = (deck: string) => Uint8Array.of(deck.length, ...new TextEncoder().encode(deck), MessageType.Auth, 0, 0)

  function tab(deck: string) {
    const sent: (Uint8Array | 'socket closed')[] = []
    const socket = { send: (data: Uint8Array) => sent.push(data), close: () => sent.push('socket closed'), readyState: 1 }
    const connection = useCollabServer().handleConnection(socket as any, new Request(`http://localhost/collab?deck=${deck}`), { deck, user: 'ana' })
    connection.handleMessage(auth(deck))
    const closes = () => sent.flatMap((data) => {
      if (data === 'socket closed')
        return [data]
      const message = new IncomingMessage(data)
      message.readVarString()
      return message.readVarUint() === MessageType.CLOSE ? [message.readVarString()] : []
    })
    return {
      closes,
      step1: (document: Y.Doc) => connection.handleMessage(new OutgoingMessage(deck).createSyncMessage().writeFirstSyncStepFor(document as any).toUint8Array()),
      update: (update: Uint8Array) => connection.handleMessage(new OutgoingMessage(deck).createSyncMessage().writeUpdate(update).toUint8Array()),
      leave: () => connection.handleClose(),
    }
  }

  const roomText = (slug: string) => useCollabServer().documents.get(slug)?.getText('codemirror').toString()
  const storedText = async (slug: string) => yDocUpdateToMarkdown((await useDraftStore().load(slug))!)

  it('closes it with the lineage reason, and applies none of what it sends', async () => {
    await useDbContent().writer.save({ slug: 'lineage-1', raw: '# v1', actor: 'ed' })
    const direct = await useCollabServer().openDirectConnection('lineage-1', { deck: 'lineage-1' })
    const foreign = doc('# v1')
    const other = tab('lineage-1')
    other.step1(foreign)
    other.update(Y.encodeStateAsUpdate(foreign))
    await vi.waitFor(() => expect(other.closes()).toEqual(['Draft lineage', 'socket closed']))
    expect(roomText('lineage-1')).toBe('# v1')
    other.leave()
    await direct.disconnect()
    expect(await storedText('lineage-1')).toBe('# v1')
  })

  it('closes a tab that sends an update before its sync step 1', async () => {
    await useDbContent().writer.save({ slug: 'lineage-2', raw: '# v1', actor: 'ed' })
    const direct = await useCollabServer().openDirectConnection('lineage-2', { deck: 'lineage-2' })
    const early = tab('lineage-2')
    early.update(Y.encodeStateAsUpdate(doc('# extra')))
    await vi.waitFor(() => expect(early.closes()).toEqual(['Draft lineage', 'socket closed']))
    expect(roomText('lineage-2')).toBe('# v1')
    early.leave()
    await direct.disconnect()
  })

  it('closes a tab of the stored lineage that writes outside the deck text, and applies none of it', async () => {
    await useDbContent().writer.save({ slug: 'lineage-4', raw: '# v1', actor: 'ed' })
    const direct = await useCollabServer().openDirectConnection('lineage-4', { deck: 'lineage-4' })
    const kept = new Y.Doc()
    Y.applyUpdate(kept, Y.encodeStateAsUpdate(direct.document!))
    const known = tab('lineage-4')
    known.step1(kept)
    const before = Y.encodeStateVector(kept)
    kept.getMap('other').set('key', 'x'.repeat(1000))
    known.update(Y.encodeStateAsUpdate(kept, before))
    await vi.waitFor(() => expect(known.closes()).toContain('socket closed'))
    expect(useCollabServer().documents.get('lineage-4')?.share.has('other')).toBe(false)
    known.leave()
    await direct.disconnect()
    const stored = new Y.Doc()
    Y.applyUpdate(stored, (await useDraftStore().load('lineage-4'))!)
    expect([...stored.share.keys()]).toEqual(['codemirror'])
  })

  it('closes a tab of the stored lineage that sends an update with pending parts, keeps none of it, and refuses its next messages', async () => {
    await useDbContent().writer.save({ slug: 'lineage-5', raw: '# v1', actor: 'ed' })
    const direct = await useCollabServer().openDirectConnection('lineage-5', { deck: 'lineage-5' })
    const kept = new Y.Doc()
    Y.applyUpdate(kept, Y.encodeStateAsUpdate(direct.document!))
    const known = tab('lineage-5')
    known.step1(kept)
    kept.getText('codemirror').insert(0, 'a')
    const withheld = Y.encodeStateVector(kept)
    kept.getText('codemirror').insert(1, 'x'.repeat(1000))
    known.update(Y.encodeStateAsUpdate(kept, withheld))
    await vi.waitFor(() => expect(known.closes()).toContain('socket closed'))
    const room = useCollabServer().documents.get('lineage-5')!
    expect(room.store.pendingStructs).toBeNull()
    expect(room.getText('codemirror').toString()).toBe('# v1')
    const next = new Y.Doc()
    Y.applyUpdate(next, Y.encodeStateAsUpdate(room))
    next.getText('codemirror').insert(0, 'y')
    known.update(Y.encodeStateAsUpdate(next, Y.encodeStateVector(room)))
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(room.getText('codemirror').toString()).toBe('# v1')
    known.leave()
    await direct.disconnect()
    expect((await useDraftStore().load('lineage-5'))!.byteLength).toBeLessThan(500)
  })

  it('accepts a tab of the stored lineage, and an empty one', async () => {
    await useDbContent().writer.save({ slug: 'lineage-3', raw: '# v1', actor: 'ed' })
    const direct = await useCollabServer().openDirectConnection('lineage-3', { deck: 'lineage-3' })
    const kept = new Y.Doc()
    Y.applyUpdate(kept, Y.encodeStateAsUpdate(direct.document!))
    const known = tab('lineage-3')
    known.step1(kept)
    const fresh = tab('lineage-3')
    fresh.step1(new Y.Doc())
    const before = Y.encodeStateVector(kept)
    kept.getText('codemirror').insert(0, '# edited\n')
    known.update(Y.encodeStateAsUpdate(kept, before))
    await vi.waitFor(() => expect(roomText('lineage-3')).toBe('# edited\n# v1'))
    expect([...known.closes(), ...fresh.closes()]).toEqual([])
    known.leave()
    fresh.leave()
    await direct.disconnect()
  })
})
