import { isDeckSlug } from '@vignettes/core/deck'
import { canActorEditDeck } from '../utils/access'
import { getActorFromRequest } from '../utils/actor'
import { useCollabServer, useDraftStore } from '../utils/collab'
import { databaseReady } from '../utils/db'
import { useDeckMeta } from '../utils/sources'

type CollabConnection = ReturnType<ReturnType<typeof useCollabServer>['handleConnection']>

/**
 * The connection of each peer, as a promise: `open` resolves the actor before it
 * hands the socket to Hocuspocus, and the first messages of the client arrive
 * meanwhile, so they wait for the connection, in their order.
 */
const connections = new Map<string, Promise<CollabConnection | null>>()

/** The peer this server's websocket handler hands to `open`, whatever crossws version h3 resolves. */
type Peer = Parameters<NonNullable<Parameters<typeof defineWebSocketHandler>[0]['open']>>[0]

/** Adapt a crossws peer to Hocuspocus' minimal WebSocketLike contract. */
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
 * `collab.ts` (server/utils) then holds every hook to that same deck.
 */
export default defineWebSocketHandler({
  async upgrade(request) {
    // An upgrade skips the request hook that holds requests during the migrations.
    await databaseReady()
    const deck = new URL(request.url).searchParams.get('deck') ?? ''
    if (!isDeckSlug(deck))
      throw new Response('A ?deck=<slug> parameter is required', { status: 400 })

    const actor = await getActorFromRequest(request)
    // One answer for every refusal, a deck that does not exist included, so the
    // upgrade tells nothing about a slug. The editor page has already shown the
    // reason, through the HTTP edit guard, before it opens this socket.
    if (!await canActorEditDeck(actor, deck))
      throw new Response('Unauthorized', { status: 401 })

    // A trashed deck refuses the session until it is restored, as the HTTP edit guard does.
    if (await useDeckMeta().isTrashed(deck))
      throw new Response('Not found', { status: 404 })

    // A session that cannot persist would silently lose every edit.
    if (!useDraftStore().isWritable())
      throw new Response('Draft storage is unavailable on this deployment', { status: 503 })
  },

  open(peer) {
    // The deck the upgrade authorized, and who edits, become the connection
    // context that every Hocuspocus hook sees (`CollabContext`).
    const deck = new URL(peer.request.url).searchParams.get('deck') ?? ''
    connections.set(peer.id, getActorFromRequest(peer.request).then((actor) => {
      // Hocuspocus reads the url and the headers of the request it is handed, and
      // the upgrade request carries both under a narrower type.
      const request = peer.request as unknown as Request
      return useCollabServer().handleConnection(toWebSocketLike(peer), request, { deck, user: actor.login ?? null })
    }).catch((error) => {
      console.warn(`[collab] could not open "${deck}": ${(error as Error).message}`)
      peer.close(1011, 'Unavailable')
      return null
    }))
  },

  message(peer, message) {
    const data = message.uint8Array()
    void connections.get(peer.id)?.then(connection => connection?.handleMessage(data))
  },

  close(peer) {
    void connections.get(peer.id)?.then(connection => connection?.handleClose())
    connections.delete(peer.id)
  },
})
