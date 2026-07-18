import { isDeckSlug } from '#shared/deck'
import { Hocuspocus } from '@hocuspocus/server'
import * as Y from 'yjs'
import { createDraftStore } from '../db/draft-store'
import { useDb } from './db'
import { publishedSource } from './sources'

/** The Y.Doc text field shared with y-codemirror.next. */
const TEXT_FIELD = 'codemirror'

let instance: Hocuspocus | undefined

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
    name: 'nuxt-slides-collab',

    async onLoadDocument({ documentName, document }) {
      if (!isDeckSlug(documentName)) {
        console.warn(`[collab] invalid document name "${documentName}"`)
        return document
      }

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
      const loaded = await publishedSource.load(documentName)
      if (!loaded) {
        console.warn(`[collab] no markdown for "${documentName}"`)
        return document
      }
      if (ytext.length > 0)
        return document
      ytext.insert(0, loaded.raw)
      return document
    },

    async onStoreDocument({ documentName, document }) {
      if (!isDeckSlug(documentName))
        return
      await useDraftStore().save(documentName, Y.encodeStateAsUpdate(document))
    },
  })
  return instance
}
