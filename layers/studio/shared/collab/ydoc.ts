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

/**
 * Whether two encoded state vectors belong to one Yjs lineage: they name a
 * client in common, or one of them is empty. Two lineages built apart from the
 * same text share no client, and merging them adds the two texts.
 */
export function sharesLineage(a: Uint8Array, b: Uint8Array): boolean {
  const left = Y.decodeStateVector(a)
  const right = Y.decodeStateVector(b)
  if (left.size === 0 || right.size === 0)
    return true
  for (const client of left.keys()) {
    if (right.has(client))
      return true
  }
  return false
}

/**
 * Turns the text of `ytext` into `next` with one deletion and one insertion
 * between their common prefix and suffix: the characters around keep their Yjs
 * items, so a concurrent edit and the carets there stay in place.
 */
export function replaceText(ytext: Y.Text, next: string): void {
  const current = ytext.toString()
  if (current === next)
    return
  let start = 0
  const shortest = Math.min(current.length, next.length)
  while (start < shortest && current[start] === next[start])
    start++
  // A boundary inside a surrogate pair would split one character in two.
  if (start > 0 && isHighSurrogate(current.charCodeAt(start - 1)))
    start--
  let end = 0
  while (end < shortest - start && current[current.length - 1 - end] === next[next.length - 1 - end])
    end++
  if (end > 0 && isLowSurrogate(current.charCodeAt(current.length - end)))
    end--
  const removed = current.length - start - end
  if (removed)
    ytext.delete(start, removed)
  const inserted = next.slice(start, next.length - end)
  if (inserted)
    ytext.insert(start, inserted)
}

/**
 * Drops the pending structs and delete set of `doc`: the parts of updates that
 * Yjs holds, out of the text, until the items they depend on arrive. A draft
 * encoded with them would carry them along. Returns whether it held any.
 */
export function dropPending(doc: Y.Doc): boolean {
  const { store } = doc
  if (!store.pendingStructs && !store.pendingDs)
    return false
  store.pendingStructs = null
  store.pendingDs = null
  return true
}

/** A refused draft write: no stored draft, an empty update over a stored draft, or an update of another lineage. */
export class DraftLineageError extends Error {}

/**
 * The stored draft once `update` is merged into it, in one compacted document:
 * the text deleted on either side leaves the bytes, which `Y.mergeUpdates`
 * would keep. Throws `DraftLineageError` when there is no stored draft, when
 * `update` is empty over a stored draft, and when it comes from another lineage.
 */
export function mergeDraftUpdate(stored: Uint8Array | null, update: Uint8Array): Uint8Array {
  if (!stored)
    throw new DraftLineageError('no stored draft to merge into')
  const incoming = Y.encodeStateVectorFromUpdate(update)
  const current = Y.encodeStateVectorFromUpdate(stored)
  if (Y.decodeStateVector(incoming).size === 0 && Y.decodeStateVector(current).size > 0)
    throw new DraftLineageError('an empty update over a stored draft')
  if (!sharesLineage(incoming, current))
    throw new DraftLineageError('an update of another lineage than the stored draft')
  const doc = new Y.Doc()
  Y.applyUpdate(doc, stored)
  Y.applyUpdate(doc, update)
  dropPending(doc)
  const merged = Y.encodeStateAsUpdate(doc)
  doc.destroy()
  return merged
}

/**
 * The rule a draft follows after a new published version `next`: a text equal
 * to `previous`, the version it followed, becomes `next` (`replace`); a text
 * equal to `next` stays (`current`); any other text holds changes not
 * published, and stays (`kept`).
 */
export function followOutcome(text: string, previous: string | null, next: string): 'replace' | 'current' | 'kept' {
  if (text === next)
    return 'current'
  return text === previous ? 'replace' : 'kept'
}

/** Applies `followOutcome` to the text of a draft, in its lineage. */
export function followText(ytext: Y.Text, previous: string | null, next: string): 'replace' | 'current' | 'kept' {
  const outcome = followOutcome(ytext.toString(), previous, next)
  if (outcome === 'replace')
    replaceText(ytext, next)
  return outcome
}

/**
 * The stored draft once `edit` changes its text in one transaction, in its
 * lineage, or null when `edit` returns false and the draft stays as it is.
 */
export function editDraftUpdate(update: Uint8Array, edit: (text: Y.Text) => boolean): Uint8Array | null {
  const doc = new Y.Doc()
  Y.applyUpdate(doc, update)
  dropPending(doc)
  let changed = false
  doc.transact(() => {
    changed = edit(doc.getText(DECK_TEXT_FIELD))
  })
  const result = changed ? Y.encodeStateAsUpdate(doc) : null
  doc.destroy()
  return result
}

/** The stored draft once its text follows `next` by `followText`, or null when it stays as it is. */
export function followDraftUpdate(update: Uint8Array, previous: string | null, next: string): Uint8Array | null {
  return editDraftUpdate(update, text => followText(text, previous, next) === 'replace')
}

/**
 * Whether an update holds deck text only: plain characters of the text field,
 * inserted or deleted, which the editor writes. Another shared type, an embed
 * or a format would grow the draft outside the length of its text. An item
 * with an origin takes the type of that origin: the size bound of the stored
 * draft holds a stored draft written with another type.
 */
export function isDeckTextUpdate(update: Uint8Array): boolean {
  for (const struct of Y.decodeUpdate(update).structs) {
    if (!(struct instanceof Y.Item))
      continue
    if (!(struct.content instanceof Y.ContentString || struct.content instanceof Y.ContentDeleted))
      return false
    // A decoded item without origins names its parent: the name of a root type,
    // or the id of the item holding a nested type. It must name the text field.
    const parent: unknown = struct.parent
    if (struct.parentSub !== null || (parent !== null && parent !== DECK_TEXT_FIELD))
      return false
  }
  return true
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xD800 && code <= 0xDBFF
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xDC00 && code <= 0xDFFF
}

/** Whether a stored update holds every item that the state vector `written` counts. */
export function includesState(update: Uint8Array, written: Uint8Array): boolean {
  const stored = Y.decodeStateVector(Y.encodeStateVectorFromUpdate(update))
  for (const [client, clock] of Y.decodeStateVector(written)) {
    if ((stored.get(client) ?? 0) < clock)
      return false
  }
  return true
}

/** Derive the markdown from a stored Y.Doc update (publishing). */
export function yDocUpdateToMarkdown(update: Uint8Array): string {
  const doc = new Y.Doc()
  Y.applyUpdate(doc, update)
  const raw = doc.getText(DECK_TEXT_FIELD).toString()
  doc.destroy()
  return raw
}
