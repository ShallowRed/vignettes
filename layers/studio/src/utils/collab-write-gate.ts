import type { Extension } from '@codemirror/state'
import type { KeyBinding } from '@codemirror/view'
import type { Doc } from 'yjs'
import { EditorState } from '@codemirror/state'

/**
 * Lets the editor change the shared text only while `open()` holds, except for
 * the changes y-codemirror applies from the Y.Doc. Before the shared text
 * arrives, a local insertion would start a Yjs lineage of its own, which the
 * stored draft does not share.
 *
 * y-codemirror dispatches the changes of the Y.Doc from its observers, which
 * Yjs calls between `beforeObserverCalls` and `afterTransaction`; the filter
 * lets every change through in that window.
 */
export function collabWriteGate(doc: Doc, open: () => boolean): Extension {
  let applyingYjs = false
  doc.on('beforeObserverCalls', () => {
    applyingYjs = true
  })
  doc.on('afterTransaction', () => {
    applyingYjs = false
  })
  return EditorState.changeFilter.of(() => applyingYjs || open())
}

/**
 * The undo and redo keys of y-codemirror, which do nothing in a read-only
 * editor: they write to the Y.Text, and the gate lets the change through.
 */
export function collabUndoKeys(bindings: readonly KeyBinding[]): KeyBinding[] {
  return bindings.map(binding => ({ ...binding, run: view => view.state.readOnly || (binding.run?.(view) ?? false) }))
}
