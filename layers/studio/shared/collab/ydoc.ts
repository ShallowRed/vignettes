import * as Y from 'yjs'

/** The Y.Doc text field carrying the deck markdown (shared with y-codemirror.next). */
export const DECK_TEXT_FIELD = 'codemirror'

/** Build a fresh Y.Doc update from raw markdown (solo saves, seeds). */
export function markdownToYDocUpdate(raw: string): Uint8Array {
  const doc = new Y.Doc()
  doc.getText(DECK_TEXT_FIELD).insert(0, raw)
  const update = Y.encodeStateAsUpdate(doc)
  doc.destroy()
  return update
}

/** Derive the markdown from a stored Y.Doc update (publishing). */
export function yDocUpdateToMarkdown(update: Uint8Array): string {
  const doc = new Y.Doc()
  Y.applyUpdate(doc, update)
  const raw = doc.getText(DECK_TEXT_FIELD).toString()
  doc.destroy()
  return raw
}
