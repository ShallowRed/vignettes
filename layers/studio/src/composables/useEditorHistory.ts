import type { TransactionSpec } from '@codemirror/state'
import type { Ref } from 'vue'
import { isolateHistory, undo as undoInEditor } from '@codemirror/commands'
import { EditorView } from '@codemirror/view'
import { ref } from 'vue'

/** The shared undo history of a collaborative draft, as `useCollabDraft` gives it. */
interface SharedHistory {
  /** Ends the group of the shared history, so that the next change is undone on its own. */
  isolateUndo: () => void
  /** Undoes the last change of this tab. */
  undo: () => void
  /** The changes this tab made to the draft. */
  localChanges: Readonly<Ref<number>>
}

interface EditorHistoryOptions {
  view: Readonly<Ref<EditorView | undefined>>
  /** Whether the draft is collaborative, which gives the shared history. */
  collab: Readonly<Ref<boolean>>
  shared: SharedHistory
}

/**
 * The undo history of the editor in its mode: the shared history of the
 * draft in collaboration, the history of the editor in solo mode. A gesture
 * made outside the source writes its change with `write`, as one step that
 * one undo takes back; `changes` counts the changes of this tab, and
 * `extension` counts them in solo mode, where every change comes from this tab.
 */
export function useEditorHistory(options: EditorHistoryOptions) {
  const soloChanges = ref(0)
  const extension = EditorView.updateListener.of((update) => {
    if (update.docChanged)
      soloChanges.value++
  })

  function write(view: EditorView, spec: TransactionSpec) {
    options.shared.isolateUndo()
    view.dispatch({ ...spec, annotations: isolateHistory.of('full') })
    options.shared.isolateUndo()
  }

  function undo() {
    if (options.collab.value)
      options.shared.undo()
    else if (options.view.value)
      undoInEditor(options.view.value)
  }

  return {
    write,
    undo,
    changes: () => options.collab.value ? options.shared.localChanges.value : soloChanges.value,
    extension,
  }
}

export type EditorHistory = ReturnType<typeof useEditorHistory>
