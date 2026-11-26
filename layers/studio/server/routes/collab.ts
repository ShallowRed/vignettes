import { isDeckSlug } from '@vignettes/core/deck'
import { canActorEditDeck } from '../utils/access'
import { getActorFromRequest } from '../utils/actor'
import { MAX_MESSAGE_BYTES, MAX_PEER_BYTES, MAX_PEER_MESSAGES, PEER_WINDOW_MS, useCollabServer, useDraftStore } from '../utils/collab'
import { databaseReady } from '../utils/db'
import { sideOfOrigin, upgradeOrigin } from '../utils/deck-origin'
import { crossOriginRefusal } from '../utils/same-origin'
import { useDeckMeta } from '../utils/sources'

type CollabConnection = ReturnType<ReturnType<typeof useCollabServer>['handleConnection']>

/**
 * What the route keeps of each peer. `open` resolves the actor before it hands
 * the socket to Hocuspocus, and the first messages of the client arrive
 * meanwhile: the messages, then the close, run one after the other on `queue`.
 * A message after `AUTHORIZATION_TTL_MS` reads the edit right again, so a
 * sign-out or a removed grant closes the socket. `window` counts the messages
 * of the current `PEER_WINDOW_MS` and their bytes.
 */
interface PeerState {
  deck: string
  connection: Promise<CollabConnection | null>
  queue: Promise<void>
  authorizedAt: number
  window: { start: number, messages: number, bytes: number }
}

const peers = new Map<string, PeerState>()
const AUTHORIZATION_TTL_MS = 30_000

async function stillAuthorized(peer: Peer, state: PeerState): Promise<boolean> {
  if (Date.now() - state.authorizedAt < AUTHORIZATION_TTL_MS)
    return true
  if (!await canActorEditDeck(await getActorFromRequest(peer.request), state.deck))
    return false
  state.authorizedAt = Date.now()
  return true
}

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
    // A page of another origin would open the socket with its visitor's cookie.
    // The deck origin holds no session to edit with: its pages open no socket.
    const origin = upgradeOrigin(request)
    if (crossOriginRefusal(request.headers, origin) || sideOfOrigin(origin) === 'decks')
      throw new Response('Forbidden', { status: 403 })

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
    const connection = getActorFromRequest(peer.request).then((actor) => {
      // Hocuspocus reads the url and the headers of the request it is handed, and
      // the upgrade request carries both under a narrower type.
      const request = peer.request as unknown as Request
      return useCollabServer().handleConnection(toWebSocketLike(peer), request, { deck, user: actor.login ?? null })
    }).catch((error) => {
      console.warn(`[collab] could not open "${deck}": ${(error as Error).message}`)
      peer.close(1011, 'Unavailable')
      return null
    })
    peers.set(peer.id, { deck, connection, queue: Promise.resolve(), authorizedAt: Date.now(), window: { start: Date.now(), messages: 0, bytes: 0 } })
  },

  message(peer, message) {
    const state = peers.get(peer.id)
    if (!state)
      return
    const data = message.uint8Array()
    if (data.byteLength > MAX_MESSAGE_BYTES) {
      peer.close(1009, 'Message too big')
      return
    }
    const now = Date.now()
    if (now - state.window.start >= PEER_WINDOW_MS)
      state.window = { start: now, messages: 0, bytes: 0 }
    state.window.messages++
    state.window.bytes += data.byteLength
    if (state.window.messages > MAX_PEER_MESSAGES || state.window.bytes > MAX_PEER_BYTES) {
      peer.close(1008, 'Too many messages')
      return
    }
    state.queue = state.queue.then(async () => {
      const connection = await state.connection
      if (!connection)
        return
      if (!await stillAuthorized(peer, state)) {
        peer.close(4403, 'Forbidden')
        return
      }
      connection.handleMessage(data)
    }).catch((error) => {
      console.warn(`[collab] message refused on "${state.deck}": ${(error as Error).message}`)
    })
  },

  close(peer) {
    const state = peers.get(peer.id)
    peers.delete(peer.id)
    if (state)
      state.queue = state.queue.then(async () => (await state.connection)?.handleClose())
  },
})
