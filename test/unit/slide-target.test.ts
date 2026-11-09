import type { TransactionSpec } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref, shallowRef } from 'vue'
import { useSlideTarget } from '../../layers/studio/src/composables/useSlideTarget'

const DECK = '# Un\n\n---\n\n## Deux\n\n----\n\n## Verticale\n\n---\n\n## Trois\n'

// A view with the members the composable reads: Vitest runs without a DOM.
function editor(doc: string) {
  const view = {
    state: EditorState.create({ doc }),
    dispatch(spec: TransactionSpec) {
      view.state = view.state.update(spec).state
    },
    focus: vi.fn(),
  }
  return view as unknown as EditorView
}

function open(target: unknown, doc = DECK) {
  const opened = vi.fn()
  const view = editor(doc)
  const ready = ref(false)
  useSlideTarget({ target, view: shallowRef(view), ready, parser: ref('separator'), opened })
  return { view, ready, opened }
}

const caretLine = (view: EditorView) => view.state.doc.lineAt(view.state.selection.main.head).number

describe('useSlideTarget', () => {
  it('waits for the view to hold the text, then puts the caret on the slide', async () => {
    const { view, ready, opened } = open('1/1', '')
    await nextTick()
    expect(opened).not.toHaveBeenCalled()

    view.dispatch({ changes: { from: 0, insert: DECK } })
    ready.value = true
    await nextTick()

    expect(caretLine(view)).toBe(8)
    expect(opened).toHaveBeenCalledWith(3, 4)
  })

  it('reads a target without a vertical index as the top of the stack', async () => {
    const { view, ready, opened } = open('2')
    ready.value = true
    await nextTick()

    expect(caretLine(view)).toBe(12)
    expect(opened).toHaveBeenCalledWith(4, 4)
  })

  it('moves the caret once, and leaves it where the writer puts it', async () => {
    const { view, ready, opened } = open('1/1')
    ready.value = true
    await nextTick()
    view.dispatch({ selection: { anchor: 0 } })
    ready.value = false
    await nextTick()
    ready.value = true
    await nextTick()

    expect(caretLine(view)).toBe(1)
    expect(opened).toHaveBeenCalledTimes(1)
  })

  it.each([['9/9'], ['1/x'], [undefined]])('leaves the caret at the start for the target %s', async (target) => {
    const { view, ready, opened } = open(target)
    ready.value = true
    await nextTick()

    expect(caretLine(view)).toBe(1)
    expect(opened).not.toHaveBeenCalled()
  })
})
