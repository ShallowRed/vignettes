import type { Connection, Document, onStoreDocumentPayload } from '@hocuspocus/server'
import type { DraftStore } from '@vignettes/core/deck'
import type { DraftFollow } from './content-push'
import { CLOSE_REASONS, REFUSAL_REASONS } from '#shared/collab/close-reasons'
import { DECK_TEXT_FIELD, DraftLineageError, dropPending, followOutcome, followText, includesState, isDeckTextUpdate, markdownToYDocUpdate, mergeDraftUpdate, replaceText, sharesLineage, yDocUpdateToMarkdown } from '#shared/collab/ydoc'
import { Hocuspocus } from '@hocuspocus/server'
import { isDeckSlug, MAX_DECK_LENGTH } from '@vignettes/core/deck'
import * as Y from 'yjs'
import { useStores } from './db'
import { publishedSource, useMediaIndex } from './sources'

/** A Yjs update of the longest deck, whose characters take up to 4 bytes: the largest message of a socket. */
export const MAX_MESSAGE_BYTES = 4 * MAX_DECK_LENGTH

/**
 * The largest draft the server stores: the text of the longest deck, and as
 * many bytes again for the Yjs items that its edits leave.
 */
export const MAX_DRAFT_BYTES = 2 * MAX_MESSAGE_BYTES

/**
 * The messages one socket may send in `PEER_WINDOW_MS`, and their bytes. A key
 * held down repeats about 33 times a second, and each repeat sends two messages,
 * the edit and the cursor: 660 messages in 10 seconds, three times under the
 * bound. The bytes hold two messages of the largest size.
 */
export const PEER_WINDOW_MS = 10_000
export const MAX_PEER_MESSAGES = 2000
export const MAX_PEER_BYTES = 2 * MAX_MESSAGE_BYTES

/**
 * The socket is authorized for ONE deck at upgrade time (`/collab?deck=<slug>`);
 * the route hands that deck, and the login editing, to Hocuspocus as the
 * connection context. Hocuspocus lets a client name any document afterwards:
 * `onAuthenticate` checks the requested name against the pinned deck, and
 * Hocuspocus hands a message only to a document its connection authenticated
 * for.
 */
export interface CollabContext {
  deck: string
  /** Login of the account behind the socket; null for a content token. */
  user?: string | null
  /** False for a write of the server that leaves no snapshot of its own. */
  snapshot?: boolean
}

function isPinnedTo(context: CollabContext | undefined, documentName: string): boolean {
  if (context?.deck === documentName)
    return true
  console.warn(`[collab] refused "${documentName}" on a socket pinned to "${context?.deck}"`)
  return false
}

let instance: Hocuspocus | undefined

/** The draft store of the server, which keeps one Yjs lineage per draft. */
export interface CollabDraftStore extends Omit<DraftStore, 'update'> {
  /**
   * Merges a state of the room into the stored draft, in the transaction of the
   * adapter; throws `DraftLineageError` for an update of another lineage, an
   * empty one, or a deck without a stored draft.
   */
  save: (slug: string, ydoc: Uint8Array) => Promise<void>
}

/**
 * The draft store backing collab sessions (gates the /collab route), and the
 * one way the server writes a draft. Each write records the images the text
 * references in the media index.
 */
export function useDraftStore(): CollabDraftStore {
  const store = useStores().drafts
  return {
    isWritable: () => store.isWritable(),
    load: slug => store.load(slug),
    stamp: slug => store.stamp(slug),
    async save(slug, ydoc) {
      await store.update(slug, stored => mergeDraftUpdate(stored, ydoc))
      await useMediaIndex().recordFromMarkdown(slug, yDocUpdateToMarkdown(ydoc))
    },
    async create(slug, ydoc) {
      const created = await store.create(slug, ydoc)
      if (created)
        await useMediaIndex().recordFromMarkdown(slug, yDocUpdateToMarkdown(ydoc))
      return created
    },
  }
}

/**
 * Whether a room of the deck is open or loading. The trash, the purge and the
 * solo save are refused meanwhile.
 */
export function hasRoom(slug: string): boolean {
  const server = useCollabServer()
  return server.documents.has(slug) || server.loadingDocuments.has(slug)
}

/**
 * A refusal Hocuspocus hands to the client: its `reason` reaches the provider's
 * `authenticationFailed` event.
 */
function refusal(reason: typeof REFUSAL_REASONS[keyof typeof REFUSAL_REASONS]): Error {
  return Object.assign(new Error(reason), { reason })
}

// The y-protocols type of a sync step 1 message (`messageYjsSyncStep1`).
const SYNC_STEP_1 = 0

// The connections whose sync step 1 shares the lineage of the room, those
// refused for another lineage, and those refused for an update the room does
// not take: Hocuspocus goes on handling the messages queued after a refusal.
const validated = new WeakSet<object>()
const refused = new WeakSet<object>()
const unsupported = new WeakSet<object>()

type CloseReason = typeof CLOSE_REASONS[keyof typeof CLOSE_REASONS]

/**
 * Ends a connection with one of `CLOSE_REASONS`, on which the client stops.
 * `Connection.close` sends the reason to the client on a socket that stays
 * open, and the socket closes after it: a tab that reads the reason shows its
 * notice, any other tab goes offline. A socket serves one deck (`isPinnedTo`).
 */
function closeConnection(connection: Connection, reason: CloseReason): void {
  connection.close({ code: 4409, reason })
  connection.webSocket.close(4409, reason)
}

function closeRoom(document: Document, reason: CloseReason): void {
  for (const connection of document.getConnections())
    closeConnection(connection, reason)
}

/**
 * Ends a connection that sent an update the room does not take, on which the
 * client goes offline and syncs again, and refuses its next messages.
 */
function unsupportedRefusal(connection: Connection, cause: string): Error {
  if (!unsupported.has(connection)) {
    unsupported.add(connection)
    console.warn(`[collab] refused ${cause} on "${connection.document.name}"`)
    connection.webSocket.close(1008, 'Unsupported content')
  }
  return new Error(cause)
}

function lineageRefusal(connection: Connection): Error {
  if (!refused.has(connection)) {
    refused.add(connection)
    closeConnection(connection, CLOSE_REASONS.lineage)
  }
  return Object.assign(new Error(CLOSE_REASONS.lineage), { reason: CLOSE_REASONS.lineage })
}

/**
 * The stored draft of a deck that has none yet: the published text, created
 * once. When two loads race (two containers during a deployment), `create`
 * writes the first and the second reads it, so every room holds one lineage.
 */
async function firstDraft(slug: string): Promise<Uint8Array> {
  const loaded = await publishedSource.load(slug)
  // A deck in the trash has no published version to load.
  if (!loaded)
    throw refusal(REFUSAL_REASONS.notFound)
  if (loaded.raw.length > MAX_DECK_LENGTH)
    throw refusal(REFUSAL_REASONS.tooLong)
  const drafts = useDraftStore()
  await drafts.create(slug, markdownToYDocUpdate(loaded.raw))
  const stored = await drafts.load(slug)
  if (!stored)
    throw new Error(`[collab] the draft of "${slug}" vanished after its creation`)
  return stored
}

/** The snapshots of the drafts (the fine history between two publications). */
export function useSnapshotStore() {
  return useStores().snapshots
}

/** Minimum time between two automatic snapshots of a deck while it is edited. */
export const SNAPSHOT_INTERVAL_MS = 5 * 60_000

// Who edited each deck since its last snapshot. Process memory: a restart
// between two snapshots forgets the logins of the interval, and a second
// instance would keep its own list.
const contributors = new Map<string, Set<string>>()

/** Note that `user` edits `slug`, for the next snapshot. */
export function noteContributor(slug: string, user: string | null | undefined): void {
  if (!user)
    return
  if (!contributors.has(slug))
    contributors.set(slug, new Set())
  contributors.get(slug)!.add(user)
}

function authorsOf(slug: string, extra: string[] = []): string[] {
  return [...new Set([...(contributors.get(slug) ?? []), ...extra])]
}

/**
 * Keep the draft as a snapshot when its text moved since the last one, with
 * the logins that edited in between. An automatic snapshot waits
 * SNAPSHOT_INTERVAL_MS after the previous one; a forced one (last editor
 * leaving, solo save, restore, request) does not. Returns the id, or null when
 * nothing was kept.
 */
export async function recordDraftSnapshot(slug: string, raw: string, options: { by?: string | null, force?: boolean, label?: string | null } = {}): Promise<number | null> {
  const store = useSnapshotStore()
  const latest = await store.latest(slug)
  if (latest && latest.raw === raw && !options.label)
    return null
  if (!options.force && latest && Date.now() - latest.createdAt < SNAPSHOT_INTERVAL_MS)
    return null
  const id = await store.add(slug, { raw, authors: authorsOf(slug, options.by ? [options.by] : []), label: options.label })
  contributors.delete(slug)
  return id
}

/** The text of a stored draft, null when the deck has none. */
async function storedDraftText(slug: string): Promise<string | null> {
  const stored = await useDraftStore().load(slug)
  return stored ? yDocUpdateToMarkdown(stored) : null
}

/** The time a room whose store failed waits before its next store. */
export const STORE_RETRY_MS = 30_000

// The rooms whose last store failed, with the payload of that store and the
// timer of the next one. Hocuspocus keeps such a room in memory and stores it
// again on the next edit only: once its last editor has left, these timers and
// `storePendingRooms` store it.
const failedStores = new Map<string, { payload: onStoreDocumentPayload, timer: ReturnType<typeof setTimeout> }>()

function scheduleStore(payload: onStoreDocumentPayload): void {
  cancelStore(payload.documentName)
  const timer = setTimeout(() => void storeFailedRoom(payload.documentName), STORE_RETRY_MS)
  timer.unref?.()
  failedStores.set(payload.documentName, { payload, timer })
}

function cancelStore(name: string): void {
  clearTimeout(failedStores.get(name)?.timer)
  failedStores.delete(name)
}

/** Stores again a room whose last store failed, through the store of Hocuspocus, which unloads the room once stored. */
async function storeFailedRoom(name: string): Promise<void> {
  const failed = failedStores.get(name)
  const server = instance
  if (!failed || server?.documents.get(name) !== failed.payload.document) {
    cancelStore(name)
    return
  }
  // The entry stays until `onStoreDocument` reads it, to report a series of failures once.
  clearTimeout(failed.timer)
  const { document } = failed.payload
  await server.storeDocumentHooks(document, { ...failed.payload, clientsCount: document.getConnectionsCount() }, true)
}

/** The draft text: the live room when one is open (the store lags by the debounce), else the stored draft. */
export async function currentDraftText(slug: string): Promise<string | null> {
  const live = useCollabServer().documents.get(slug)
  return live ? live.getText(DECK_TEXT_FIELD).toString() : storedDraftText(slug)
}

/**
 * Lazy Hocuspocus singleton speaking only to the content ports: drafts load and
 * persist as opaque Y.Doc binaries (DraftStore); a deck with no draft gets one
 * from its published markdown (ContentSource) before its room opens. Publishing
 * is a separate explicit act.
 * Document names are deck slugs (`isDeckSlug`).
 */
export function useCollabServer(): Hocuspocus {
  instance ??= new Hocuspocus({
    name: 'vignettes-collab',

    // Hocuspocus calls it for each connection and each document it names, and
    // its refusal stays with that connection. It reads nothing from storage: an
    // await here would let a direct connection unload the room meanwhile, and
    // the client would join a destroyed document.
    async onAuthenticate({ documentName, context }) {
      if (!isPinnedTo(context, documentName))
        throw refusal(REFUSAL_REASONS.notPinned)
    },

    // Hocuspocus loads a document once per process and starts listening to its
    // updates afterwards: a seed inserted here would only be stored at the first
    // keystroke, and a tab kept across an unload would merge its own copy into
    // the next seed. The room applies the stored draft, created first if needed.
    async onLoadDocument({ documentName, document }) {
      if (!isDeckSlug(documentName))
        throw refusal(REFUSAL_REASONS.notFound)
      const stored = await useDraftStore().load(documentName) ?? await firstDraft(documentName)
      Y.applyUpdate(document, stored)
      // A draft stored before `mergeDraftUpdate` dropped the pending parts may hold some.
      dropPending(document)
      return document
    },

    // A tab holds the Y.Doc it synced, across a disconnection. Its first sync
    // message carries the state vector of that document: one that shares no
    // client with the room comes from another lineage, and merging it would add
    // its text to the room's. Hocuspocus documents this hook as synchronous: it
    // reads the message and the room only, with no storage access.
    async beforeSync({ type, payload, document, connection }) {
      if (type === SYNC_STEP_1) {
        if (!sharesLineage(payload, Y.encodeStateVector(document))) {
          console.warn(`[collab] refused a tab of another lineage on "${document.name}"`)
          throw lineageRefusal(connection)
        }
        validated.add(connection)
        return
      }
      if (!validated.has(connection))
        throw lineageRefusal(connection)
      // The other sync messages carry an update, which the editor fills with deck text only.
      if (!isDeckTextUpdate(payload))
        throw unsupportedRefusal(connection, 'an update with content other than deck text')
    },

    async beforeHandleMessage({ connection }) {
      if (refused.has(connection))
        throw lineageRefusal(connection)
      if (unsupported.has(connection))
        throw unsupportedRefusal(connection, 'a message after an update the room does not take')
    },

    // Yjs holds as pending, in memory and out of the text, the part of an
    // update whose items or deletions depend on items the room lacks: the hook
    // drops that part and ends the connection that sent it.
    async afterHandleMessage({ document, connection }) {
      if (dropPending(document))
        unsupportedRefusal(connection, 'an update with pending parts')
    },

    // A document past the limit closes its connections unstored: the editor
    // stops and offers to reload the draft last stored.
    async onChange({ documentName, document, context }) {
      noteContributor(documentName, (context as CollabContext | undefined)?.user)
      if (document.getText(DECK_TEXT_FIELD).length > MAX_DECK_LENGTH) {
        console.warn(`[collab] "${documentName}" holds more than ${MAX_DECK_LENGTH} characters: connections closed`)
        closeRoom(document, CLOSE_REASONS.tooLong)
      }
    },

    async onStoreDocument(payload) {
      const { documentName, document, clientsCount, lastContext } = payload
      const retried = failedStores.has(documentName)
      cancelStore(documentName)
      if (!isDeckSlug(documentName) || document.getText(DECK_TEXT_FIELD).length > MAX_DECK_LENGTH)
        return
      const update = Y.encodeStateAsUpdate(document)
      if (update.byteLength > MAX_DRAFT_BYTES) {
        console.warn(`[collab] "${documentName}" holds more than ${MAX_DRAFT_BYTES} bytes: connections closed`)
        closeRoom(document, CLOSE_REASONS.tooLong)
        return
      }
      try {
        await useDraftStore().save(documentName, update)
      }
      catch (error) {
        if (!(error instanceof DraftLineageError)) {
          scheduleStore(payload)
          if (!retried)
            useNitroApp().captureError(error as Error, { tags: ['collab'] })
          throw error
        }
        // Hocuspocus 4.4 tries no second store, and unloads the room when its
        // last client leaves: the text of the room goes to the history, and its
        // editors reload the stored draft.
        console.warn(`[collab] "${documentName}": ${error.message}; the text of the room is kept as a snapshot`)
        await recordDraftSnapshot(documentName, document.getText(DECK_TEXT_FIELD).toString(), { force: true })
        closeRoom(document, CLOSE_REASONS.lineage)
        return
      }
      if ((lastContext as CollabContext | undefined)?.snapshot === false)
        return
      // The last editor leaving closes the editing session: keep its final state.
      await recordDraftSnapshot(documentName, document.getText(DECK_TEXT_FIELD).toString(), { force: clientsCount === 0 })
    },

    async afterUnloadDocument({ documentName }) {
      cancelStore(documentName)
    },
  })
  return instance
}

/**
 * Stores now the rooms whose save waits for the Hocuspocus debounce, as its
 * `flushPendingStores` does, and those whose last store failed, and resolves
 * once they are stored. The server calls it when it stops, before it closes the
 * database: the sockets that close with the server would store these rooms into
 * a closed database.
 */
export async function storePendingRooms(): Promise<void> {
  const server = instance
  if (!server)
    return
  await Promise.all([...server.documents.keys()].map(name => failedStores.has(name) ? storeFailedRoom(name) : server.debouncer.executeNow(`onStoreDocument-${name}`)))
}

/**
 * Ends a write of the server through a direct connection: the store runs at
 * once, the room unloads once when no one else holds it, and the stored draft
 * must hold the state that the write reached.
 */
async function endDirectWrite(slug: string, connection: Awaited<ReturnType<Hocuspocus['openDirectConnection']>>): Promise<void> {
  const server = useCollabServer()
  const document = connection.document!
  const written = Y.encodeStateVector(document)
  // Hocuspocus 4.4 unloads a room twice after an immediate unload: the second
  // call, after the store, removes by name a room opened in between. The store
  // runs here and unloads the room once.
  await connection.disconnect({ unloadImmediately: false })
  await server.debouncer.executeNow(`onStoreDocument-${slug}`)
  // The store unloads an empty room on the next macrotask: the caller's next
  // write meets no room.
  await new Promise(resolve => setTimeout(resolve, 0))
  await server.unloadingDocuments.get(slug)
  const stored = await useDraftStore().load(slug)
  if (stored && includesState(stored, written))
    return
  // Hocuspocus keeps in memory a room whose store failed. A room with no
  // editor unloads, and the next one loads the stored draft.
  if (server.documents.get(slug) === document)
    await server.unloadDocument(document)
  throw new Error(`[collab] the draft of "${slug}" does not hold the text just written`)
}

/**
 * Writes `raw` as the text of the draft, in its lineage: through a direct
 * connection to the room, which loads the stored draft or joins the open room,
 * so every editor receives the change and a tab that holds the lineage merges
 * one copy. A deck with neither draft nor published version gets its first
 * draft. The write leaves no snapshot; the callers record theirs. Throws when
 * the stored draft does not hold the write.
 */
export async function writeDraftText(slug: string, raw: string, by?: string | null): Promise<void> {
  const drafts = useDraftStore()
  if (!await drafts.load(slug) && !await publishedSource.load(slug) && await drafts.create(slug, markdownToYDocUpdate(raw)))
    return
  const context: CollabContext = { deck: slug, user: by ?? null, snapshot: false }
  const connection = await useCollabServer().openDirectConnection(slug, context).catch(async (error: { reason?: string }) => {
    // A published version past the limit opens no room, and no tab holds one.
    if (error.reason === REFUSAL_REASONS.tooLong && await drafts.create(slug, markdownToYDocUpdate(raw)))
      return null
    throw error
  })
  if (!connection)
    return
  await connection.transact(document => replaceText(document.getText(DECK_TEXT_FIELD), raw))
  await endDirectWrite(slug, connection)
}

/**
 * After a new published version `next`, the draft follows it by `followOutcome`:
 * `'updated'` when it holds `previous` or `next`, `'kept'` when it holds changes
 * not published, `'none'` for a deck without a draft, which gets none. An open
 * or loading room receives the text through a direct connection. Without
 * `apply`, says what it would do and writes nothing.
 */
export async function followPublication(slug: string, previous: string | null, next: string, { apply }: { apply: boolean }): Promise<DraftFollow> {
  const server = useCollabServer()
  const loading = server.loadingDocuments.has(slug)
  const live = server.documents.get(slug)
  const text = live ? live.getText(DECK_TEXT_FIELD).toString() : await storedDraftText(slug)
  if (text === null && !loading)
    return 'none'
  // A loading room has no text to read yet: the connection reads it.
  const outcome = text === null ? 'replace' : followOutcome(text, previous, next)
  if (outcome === 'current')
    return 'updated'
  if (outcome === 'kept')
    return 'kept'
  if (!apply)
    return 'updated'
  const connection = await server.openDirectConnection(slug, { deck: slug, user: null, snapshot: false })
  let follow: DraftFollow = 'updated'
  await connection.transact((document) => {
    if (followText(document.getText(DECK_TEXT_FIELD), previous, next) === 'kept')
      follow = 'kept'
  })
  await endDirectWrite(slug, connection)
  return follow
}

/** Tells the editors of an open room that the deck has a new published version, so their header reads it again. */
export function announcePublication(slug: string): void {
  useCollabServer().documents.get(slug)?.broadcastStateless(JSON.stringify({ type: 'published', at: Date.now() }))
}

/**
 * Replace the whole draft text of a deck (restoring a version or a snapshot).
 * The text being replaced is kept as a snapshot first, so the restore can be
 * undone from the history.
 */
export async function replaceDraft(slug: string, raw: string, by?: string | null): Promise<void> {
  const current = await currentDraftText(slug)
  if (current !== null && current !== raw)
    await recordDraftSnapshot(slug, current, { by, force: true })
  await writeDraftText(slug, raw, by)
}
