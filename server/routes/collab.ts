import type { Peer } from 'crossws'
import { isPrivileged } from '#shared/access'
import { isDeckSlug } from '#shared/deck'
import { getActorFromRequest } from '../utils/actor'
import { useCollabServer, useDraftStore } from '../utils/collab'
import { useDeckMeta, useGrants } from '../utils/sources'

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
 * Real-time collaboration endpoint (`/collab?deck=<slug>`). The session cookie
 * rides the same-origin upgrade request, so auth happens here — Hocuspocus
 * receives only already-authorized connections.
 *
 * The deck travels in the query because the upgrade must decide BEFORE the
 * Hocuspocus handshake reveals the document name. Authorization mirrors the HTTP
 * edit rule: a privileged role, or an `editor` grant on THIS deck — so a deck can
 * be shared with an outside collaborator without making them a global editor.
 * `collab.ts` (server/utils) then pins the socket to that same deck.
 */
export default defineWebSocketHandler({
  async upgrade(request) {
    const deck = new URL(request.url).searchParams.get('deck') ?? ''
    if (!isDeckSlug(deck))
      throw new Response('A ?deck=<slug> parameter is required', { status: 400 })

    const actor = await getActorFromRequest(request)
    const granted = actor.id != null
      && await useGrants().get(deck, actor.id).catch(() => undefined) === 'editor'
    if (!isPrivileged(actor.role) && !granted)
      throw new Response('Editing requires an owner/editor role or an editor grant on this deck', { status: 401 })

    // A trashed deck is not editable: refuse the collab session until it is
    // restored, mirroring the HTTP edit guard.
    if (await useDeckMeta().isTrashed(deck))
      throw new Response('Not found', { status: 404 })

    // A session that cannot persist would silently lose every edit.
    if (!useDraftStore().isWritable())
      throw new Response('Draft storage is unavailable on this deployment', { status: 503 })
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
