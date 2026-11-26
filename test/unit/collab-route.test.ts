import { describe, expect, it, vi } from 'vitest'
import { stubH3Globals } from './helpers/server-db'

// The actor of a socket comes from the database, and the client speaks first:
// its messages wait for the connection.
stubH3Globals()

let resolveActor: (actor: { login: string }) => void = () => {}
let nextActor = () => new Promise((resolve) => {
  resolveActor = resolve
})
let mayEdit = true
const handled: string[] = []

vi.mock('../../layers/studio/server/utils/actor', () => ({
  getActorFromRequest: () => nextActor(),
}))
vi.mock('../../layers/studio/server/utils/access', () => ({
  canActorEditDeck: async () => mayEdit,
}))
vi.mock('../../layers/studio/server/utils/collab', () => ({
  MAX_MESSAGE_BYTES: 1024,
  MAX_PEER_MESSAGES: 3,
  MAX_PEER_BYTES: 2048,
  PEER_WINDOW_MS: 10_000,
  useCollabServer: () => ({
    handleConnection: (_socket: unknown, _request: unknown, context: { user: string }) => ({
      handleMessage: (data: Uint8Array) => handled.push(`${context.user}:${new TextDecoder().decode(data)}`),
      handleClose: () => handled.push('closed'),
    }),
  }),
  useDraftStore: () => ({}),
}))

const { default: collab } = await import('../../layers/studio/server/routes/collab')
const message = (text: string) => ({ uint8Array: () => new TextEncoder().encode(text) })

describe('the collab socket', () => {
  it('hands the messages sent before the actor resolves to the connection, in order', async () => {
    const peer = { id: 'p1', request: { url: 'https://x/collab?deck=deck' }, send: () => {}, close: () => {} }
    collab.open!(peer as any)
    collab.message!(peer as any, message('sync') as any)
    collab.message!(peer as any, message('awareness') as any)
    collab.close!(peer as any, {} as any)
    resolveActor({ login: 'ana' })
    await vi.waitFor(() => expect(handled).toEqual(['ana:sync', 'ana:awareness', 'closed']))
  })

  it('reads the edit right again after 30 seconds, and closes a socket that lost it', async () => {
    handled.length = 0
    nextActor = async () => ({ login: 'ana' })
    const closed: number[] = []
    const peer = { id: 'p2', request: { url: 'https://x/collab?deck=deck' }, send: () => {}, close: (code: number) => closed.push(code) }
    const now = vi.spyOn(Date, 'now')
    now.mockReturnValue(0)
    collab.open!(peer as any)
    collab.message!(peer as any, message('before') as any)
    await vi.waitFor(() => expect(handled).toEqual(['ana:before']))
    mayEdit = false
    now.mockReturnValue(31_000)
    collab.message!(peer as any, message('after') as any)
    await vi.waitFor(() => expect(closed).toEqual([4403]))
    expect(handled).toEqual(['ana:before'])
    now.mockRestore()
  })

  it('closes a socket that sends more messages or bytes than a window allows, and counts again in the next window', async () => {
    handled.length = 0
    mayEdit = true
    nextActor = async () => ({ login: 'ana' })
    const closed: number[] = []
    const now = vi.spyOn(Date, 'now')
    now.mockReturnValue(100_000)
    const peer = { id: 'p3', request: { url: 'https://x/collab?deck=deck' }, send: () => {}, close: (code: number) => closed.push(code) }
    collab.open!(peer as any)
    for (const text of ['a', 'b', 'c'])
      collab.message!(peer as any, message(text) as any)
    now.mockReturnValue(110_000)
    collab.message!(peer as any, message('next window') as any)
    await vi.waitFor(() => expect(handled).toEqual(['ana:a', 'ana:b', 'ana:c', 'ana:next window']))
    expect(closed).toEqual([])
    for (const text of ['d', 'e', 'f'])
      collab.message!(peer as any, message(text) as any)
    expect(closed).toEqual([1008])
    await vi.waitFor(() => expect(handled).toEqual(['ana:a', 'ana:b', 'ana:c', 'ana:next window', 'ana:d', 'ana:e']))

    const heavy = { ...peer, id: 'p4', close: (code: number) => closed.push(code) }
    collab.open!(heavy as any)
    collab.message!(heavy as any, message('x'.repeat(1000)) as any)
    collab.message!(heavy as any, message('x'.repeat(1000)) as any)
    collab.message!(heavy as any, message('x'.repeat(1000)) as any)
    expect(closed).toEqual([1008, 1008])
    now.mockRestore()
  })
})
