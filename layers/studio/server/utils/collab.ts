import { Hocuspocus } from '@hocuspocus/server'
import { isDeckSlug } from '@vignettes/core/deck'
import * as Y from 'yjs'
import { createDraftStore } from '../db/draft-store'
import { useDb } from './db'
import { publishedSource } from './sources'

/** The Y.Doc text field shared with y-codemirror.next. */
const TEXT_FIELD = 'codemirror'

/**
 * The socket is authorized for ONE deck at upgrade time (`/collab?deck=<slug>`);
 * the route hands that deck to Hocuspocus as the connection context. Hocuspocus
 * lets a client name any document afterwards, so the load and message hooks
 * check the requested name against the pinned deck. The store hook does not:
 * only updates that passed the message check reach a document, and the earlier
 * store-time check (on request parameters the hook never receives) silently
 * dropped every save.
 */
export interface CollabContext {
  deck: string
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

/** The draft store backing collab sessions (gates the /collab route). */
export function useDraftStore() {
  return createDraftStore(useDb())
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

    async onStoreDocument({ documentName, document }) {
      if (!isDeckSlug(documentName))
        return
      await useDraftStore().save(documentName, Y.encodeStateAsUpdate(document))
    },
  })
  return instance
}

/**
 * Replace the whole draft text of a deck (restoring a version). The change goes
 * through the live room when one is open, so every editor receives it and
 * Hocuspocus stores it; otherwise it is applied to the stored document, whose
 * lineage a client reconnecting later still merges with.
 */
export async function replaceDraft(slug: string, raw: string): Promise<void> {
  const live = useCollabServer().documents.get(slug)
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
