import type { TransactionSpec } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { history } from '@codemirror/commands'
import { EditorState, Transaction } from '@codemirror/state'
import { duplicateEdit, moveStackEdit, removeEdit } from '@vignettes/core/deck'
import { describe, expect, it } from 'vitest'
import { ref, shallowRef } from 'vue'
import { useEditorHistory } from '../../layers/studio/src/composables/useEditorHistory'
import { outlineTransaction } from '../../layers/studio/src/utils/editor-outline'

const DECK = '## Un\n\nTexte un.\n\n## Deux\n\nTexte deux.\n\n## Trois\n\nTexte trois.\n'

// An editor with the history of solo mode, with the members the history reads: Vitest runs without a DOM.
function editor(calls: string[] = []) {
  const view = {
    state: EditorState.create({ doc: DECK, extensions: history() }),
    dispatch(spec: Transaction | TransactionSpec) {
      calls.push('dispatch')
      view.state = spec instanceof Transaction ? spec.state : view.state.update(spec).state
    },
  }
  return view as unknown as EditorView
}

function sharedHistory(calls: string[]) {
  return { isolateUndo: () => calls.push('isolate'), undo: () => calls.push('undo'), localChanges: ref(3) }
}

describe('useEditorHistory', () => {
  it('writes an edit of the outline as one step, which one undo takes back in solo mode', () => {
    for (const edit of [moveStackEdit(DECK, 'heading', 2, 0)!, duplicateEdit(DECK, 'heading', 1, 0)!, removeEdit(DECK, 'heading', 0, 0)!]) {
      const view = editor()
      const editorHistory = useEditorHistory({ view: shallowRef(view), collab: ref(false), shared: sharedHistory([]) })
      // A change typed just before the edit stays a step of its own.
      view.dispatch({ changes: { from: 0, insert: 'x' }, userEvent: 'input.type' })
      const typed = view.state.doc.toString()
      const shifted = { changes: edit.changes.map(change => ({ ...change, from: change.from + 1, to: change.to + 1 })), anchor: edit.anchor + 1 }
      editorHistory.write(view, outlineTransaction(shifted))
      expect(view.state.doc.toString()).not.toBe(typed)
      editorHistory.undo()
      expect(view.state.doc.toString()).toBe(typed)
    }
  })

  it('closes the group of the shared history around a change, and undoes and counts in it, in collaboration', () => {
    const calls: string[] = []
    const view = editor(calls)
    const editorHistory = useEditorHistory({ view: shallowRef(view), collab: ref(true), shared: sharedHistory(calls) })
    editorHistory.write(view, { changes: { from: 0, insert: 'x' } })
    editorHistory.undo()
    expect(calls).toEqual(['isolate', 'dispatch', 'isolate', 'undo'])
    expect(editorHistory.changes()).toBe(3)
  })
})
