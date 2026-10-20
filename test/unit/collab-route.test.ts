import { describe, expect, it, vi } from 'vitest'
import { stubH3Globals } from './helpers/server-db'

// The actor of a socket comes from the database, and the client speaks first:
// its messages wait for the connection.
stubH3Globals()

let resolveActor: (actor: { login: string }) => void = () => {}
const handled: string[] = []

vi.mock('../../layers/studio/server/utils/actor', () => ({
  getActorFromRequest: () => new Promise((resolve) => {
    resolveActor = resolve
  }),
}))
vi.mock('../../layers/studio/server/utils/collab', () => ({
  useCollabServer: () => ({
    handleConnection: (_socket: unknown, _request: unknown, context: { user: string }) => ({
      handleMessage: (data: Uint8Array) => handled.push(`${context.user}:${new TextDecoder().decode(data)}`),
      handleClose: () => handled.push('closed'),
    }),
  }),
  useDraftStore: () => ({}),
}))

const { default: collab } = await import('../../layers/studio/server/routes/collab')

describe('the collab socket', () => {
  it('hands the messages sent before the actor resolves to the connection, in order', async () => {
    const peer = { id: 'p1', request: { url: 'https://x/collab?deck=deck' }, send: () => {}, close: () => {} }
    const message = (text: string) => ({ uint8Array: () => new TextEncoder().encode(text) })
    collab.open!(peer as any)
    collab.message!(peer as any, message('sync') as any)
    collab.message!(peer as any, message('awareness') as any)
    collab.close!(peer as any, {} as any)
    resolveActor({ login: 'ana' })
    await vi.waitFor(() => expect(handled).toEqual(['ana:sync', 'ana:awareness', 'closed']))
  })
})
