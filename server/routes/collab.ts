import type { Peer } from 'crossws'
import { isPrivileged } from '#shared/access'
import { getActorRoleFromRequest } from '../utils/actor'
import { useCollabServer } from '../utils/collab'

type CollabConnection = ReturnType<ReturnType<typeof useCollabServer>['handleConnection']>

const connections = new Map<string, CollabConnection>()

/** Adapt a crossws Peer to Hocuspocus' minimal WebSocketLike contract. */
function toWebSocketLike(peer: Peer) {
  return {
    send: (data: string | ArrayBufferLike | Blob | ArrayBufferView) => peer.send(data),
    close: (code?: number, reason?: string) => peer.close(code, reason),
    get readyState() {
      return peer.websocket?.readyState ?? 1
    },
  }
}

/**
 * Real-time collaboration endpoint (`/collab`). The session cookie rides the
 * same-origin upgrade request, so auth happens here — Hocuspocus receives only
 * already-authorized connections.
 */
export default defineWebSocketHandler({
  async upgrade(request) {
    if (!isPrivileged(await getActorRoleFromRequest(request)))
      throw new Response('Owner or editor role required', { status: 401 })
  },

  open(peer) {
    connections.set(peer.id, useCollabServer().handleConnection(toWebSocketLike(peer), peer.request))
  },

  message(peer, message) {
    connections.get(peer.id)?.handleMessage(message.uint8Array())
  },

  close(peer) {
    connections.get(peer.id)?.handleClose()
    connections.delete(peer.id)
  },
})
