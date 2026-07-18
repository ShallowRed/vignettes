import { isDeckSlug } from '#shared/deck'
import { Hocuspocus } from '@hocuspocus/server'
import { fileSource, fileWriter } from './sources'

/** The Y.Doc text field shared with y-codemirror.next. */
const TEXT_FIELD = 'codemirror'

let instance: Hocuspocus | undefined

/**
 * Lazy Hocuspocus singleton bridging live Y.Text documents to deck markdown
 * through the content ports: markdown stays the source of truth, Yjs is only
 * the real-time transport. Document names are deck slugs (`isDeckSlug`).
 */
export function useCollabServer(): Hocuspocus {
  instance ??= new Hocuspocus({
    name: 'nuxt-slides-collab',

    async onLoadDocument({ documentName, document }) {
      const ytext = document.getText(TEXT_FIELD)
      // Idempotent seed: reconnect/unload cycles re-enter here; without the
      // length guards (before AND after the await) the file gets stacked onto
      // the live text, turning one deck into N copies.
      if (ytext.length > 0)
        return document

      const loaded = isDeckSlug(documentName) ? await fileSource.load(documentName) : null
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
      const raw = document.getText(TEXT_FIELD).toString()
      // Never let a transient empty state wipe the committed deck.
      if (raw.length === 0)
        return
      await fileWriter.save({ slug: documentName, raw })
    },
  })
  return instance
}
