import type { EditorState } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { EDITOR_TEXT } from '../utils/editor-layout'

/**
 * What a toolbar panel reads at the cursor, read again when the panel opens and,
 * while it is open, on each change of the text, which another author may make.
 */
export function useCursorReading<T>(view: () => EditorView | undefined, read: (state: EditorState) => T) {
  const open = ref(false)
  const initial = view()
  const current = shallowRef<T | undefined>(initial ? read(initial.state) : undefined)

  function refresh() {
    const at = view()
    if (at)
      current.value = read(at.state)
  }

  watch(open, (opened) => {
    if (opened)
      refresh()
  })
  const text = inject(EDITOR_TEXT, undefined)
  watch(() => text?.value, () => {
    if (open.value)
      refresh()
  })

  return { open, current, refresh }
}
