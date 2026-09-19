import type { DraftStore } from '@vignettes/core/deck'
import { yDocUpdateToMarkdown } from '#shared/collab/ydoc'
import { Hocuspocus } from '@hocuspocus/server'
import { isDeckSlug } from '@vignettes/core/deck'
import * as Y from 'yjs'
import { createDraftStore } from '../db/draft-store'
import { createSnapshotStore } from '../db/snapshot-store'
import { useDb } from './db'
import { publishedSource, useMediaIndex } from './sources'

/** The Y.Doc text field shared with y-codemirror.next. */
const TEXT_FIELD = 'codemirror'

/**
 * The socket is authorized for ONE deck at upgrade time (`/collab?deck=<slug>`);
 * the route hands that deck, and the login editing, to Hocuspocus as the
 * connection context. Hocuspocus
 * lets a client name any document afterwards, so the load and message hooks
 * check the requested name against the pinned deck. The store hook does not:
 * only updates that passed the message check reach a document, and the earlier
 * store-time check (on request parameters the hook never receives) silently
 * dropped every save.
 */
export interface CollabContext {
  deck: string
  /** Login of the account behind the socket; null for a content token. */
  user?: string | null
}

export function isPinnedTo(context: CollabContext | undefined, documentName: string): boolean {
  if (context?.deck === documentName)
    return true
  console.warn(`[collab] refused "${documentName}" on a socket pinned to "${context?.deck}"`)
  return false
}

let instance: Hocuspocus | undefined

// One seed at a time per deck: Hocuspocus loads a document once, but two clients
// racing the very first connection could both find an empty text and stack the
// published markdown twice. Serialising the seed makes the second wait.
const seeding = new Map<string, Promise<void>>()

/**
 * The draft store backing collab sessions (gates the /collab route). Each save
 * records the images the text references in the media index.
 */
export function useDraftStore(): DraftStore {
  const store = createDraftStore(useDb())
  return {
    ...store,
    async save(slug, ydoc) {
      await store.save(slug, ydoc)
      await useMediaIndex().recordFromMarkdown(slug, yDocUpdateToMarkdown(ydoc))
    },
  }
}

/** The snapshots of the drafts (the fine history between two publications). */
export function useSnapshotStore() {
  return createSnapshotStore(useDb())
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
  if (!stored)
    return null
  const doc = new Y.Doc()
  Y.applyUpdate(doc, stored)
  const raw = doc.getText(TEXT_FIELD).toString()
  doc.destroy()
  return raw
}

/** The draft text: the live room when one is open (the store lags by the debounce), else the stored draft. */
export async function currentDraftText(slug: string): Promise<string | null> {
  const live = useCollabServer().documents.get(slug)
  return live ? live.getText(TEXT_FIELD).toString() : storedDraftText(slug)
}

/**
 * Lazy Hocuspocus singleton speaking only to the content ports: drafts load and
 * persist as opaque Y.Doc binaries (DraftStore); a deck with no draft seeds from
 * its published markdown (ContentSource). Publishing is a separate explicit act.
 * Document names are deck slugs (`isDeckSlug`).
 */
export function useCollabServer(): Hocuspocus {
  instance ??= new Hocuspocus({
    name: 'vignettes-collab',

    async onLoadDocument({ documentName, document, context }) {
      if (!isDeckSlug(documentName)) {
        console.warn(`[collab] invalid document name "${documentName}"`)
        return document
      }
      // Serve no content to a document the socket wasn't authorized for.
      if (!isPinnedTo(context, documentName))
        return document

      const draft = await useDraftStore().load(documentName)
      if (draft) {
        // CRDT merge: applying the stored update is idempotent by construction.
        Y.applyUpdate(document, draft)
        return document
      }

      const ytext = document.getText(TEXT_FIELD)
      // Idempotent seed: reconnect/unload cycles re-enter here; without the
      // length guards (before AND after the await) the file gets stacked onto
      // the live text, turning one deck into N copies.
      if (ytext.length > 0)
        return document
      const pending = seeding.get(documentName)
      if (pending) {
        await pending
        return document
      }
      const seed = (async () => {
        const loaded = await publishedSource.load(documentName)
        if (!loaded) {
          console.warn(`[collab] no markdown for "${documentName}"`)
          return
        }
        if (ytext.length > 0)
          return
        ytext.insert(0, loaded.raw)
      })()
      seeding.set(documentName, seed)
      try {
        await seed
      }
      finally {
        seeding.delete(documentName)
      }
      return document
    },

    // A document is loaded once and then shared by every connection that names
    // it, so the load-time check alone would let a socket pinned to deck A push
    // updates into an already-open deck B. Throwing here closes that socket.
    async beforeHandleMessage({ documentName, context }) {
      if (!isPinnedTo(context, documentName))
        throw new Error(`Socket not authorized for "${documentName}"`)
    },

    async onChange({ documentName, context }) {
      noteContributor(documentName, (context as CollabContext | undefined)?.user)
    },

    async onStoreDocument({ documentName, document, clientsCount }) {
      if (!isDeckSlug(documentName))
        return
      await useDraftStore().save(documentName, Y.encodeStateAsUpdate(document))
      // The last editor leaving closes the editing session: keep its final state.
      await recordDraftSnapshot(documentName, document.getText(TEXT_FIELD).toString(), { force: clientsCount === 0 })
    },
  })
  return instance
}

/**
 * Replace the whole draft text of a deck (restoring a version or a snapshot).
 * The text being replaced is kept as a snapshot first, so the restore can be
 * undone from the history. The change goes through the live room when one is
 * open, so every editor receives it and Hocuspocus stores it; otherwise it is
 * applied to the stored document, whose lineage a client reconnecting later
 * still merges with.
 */
export async function replaceDraft(slug: string, raw: string, by?: string | null): Promise<void> {
  // The room is read once: the text kept and the text replaced are the same.
  const live = useCollabServer().documents.get(slug)
  const current = live ? live.getText(TEXT_FIELD).toString() : await storedDraftText(slug)
  if (current !== null && current !== raw)
    await recordDraftSnapshot(slug, current, { by, force: true })
  if (live) {
    const ytext = live.getText(TEXT_FIELD)
    live.transact(() => {
      ytext.delete(0, ytext.length)
      ytext.insert(0, raw)
    })
    return
  }
  const drafts = useDraftStore()
  const stored = await drafts.load(slug)
  const doc = new Y.Doc()
  if (stored)
    Y.applyUpdate(doc, stored)
  const ytext = doc.getText(TEXT_FIELD)
  doc.transact(() => {
    ytext.delete(0, ytext.length)
    ytext.insert(0, raw)
  })
  await drafts.save(slug, Y.encodeStateAsUpdate(doc))
  doc.destroy()
}
