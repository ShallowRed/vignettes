import { EditorState } from '@codemirror/state'
import { moveStackEdit } from '@vignettes/core/deck'
import { describe, expect, it } from 'vitest'
import { nextTick, ref } from 'vue'
import { dropPlace, outlineTransaction, undoNotices } from '../../layers/studio/src/utils/editor-outline'

const DECK = '## Un\n\nTexte un.\n\n## Deux\n\nTexte deux.\n\n## Trois\n\nTexte trois.\n'

describe('outlineTransaction', () => {
  it('places the caret where the edit says, and leaves it to follow the changes without an anchor', () => {
    const edit = moveStackEdit(DECK, 'heading', 2, 0)!
    const state = EditorState.create({ doc: DECK }).update(outlineTransaction(edit)).state
    expect(state.doc.sliceString(state.selection.main.head).startsWith('## Trois')).toBe(true)
    const end = EditorState.create({ doc: DECK, selection: { anchor: DECK.length } })
    const renamed = end.update(outlineTransaction({ changes: [{ from: 3, to: 5, insert: 'Premier' }] })).state
    expect(renamed.selection.main.head).toBe(renamed.doc.length)
  })
})

describe('undoNotices', () => {
  function setup() {
    const open = new Map<string | number, { 'onUpdate:open'?: (open: boolean) => void }>()
    let next = 0
    const toasts = {
      add: (toast: { 'onUpdate:open'?: (open: boolean) => void }) => {
        const id = ++next
        open.set(id, toast)
        return { id }
      },
      remove: (id: string | number) => void open.delete(id),
    }
    const changes = ref(0)
    return { open, changes, notices: undoNotices(toasts, () => changes.value) }
  }

  it('keeps the notice of the second of two removals in a row, until the next change', async () => {
    const { open, changes, notices } = setup()
    changes.value++
    notices.show({ title: 'Première' })
    const first = [...open.values()][0]!
    changes.value++
    notices.show({ title: 'Seconde' })
    expect([...open.keys()]).toEqual([2])
    // The first notice closing after the second one opened leaves the second one open.
    first['onUpdate:open']?.(false)
    await nextTick()
    expect([...open.keys()]).toEqual([2])
    changes.value++
    await nextTick()
    expect(open.size).toBe(0)
  })
})

describe('dropPlace', () => {
  it('places a stack dropped before or after a stack above or below it, and keeps it on itself', () => {
    expect(dropPlace(1, { h: 3, after: true })).toBe(3)
    expect(dropPlace(1, { h: 3, after: false })).toBe(2)
    expect(dropPlace(2, { h: 0, after: true })).toBe(1)
    expect(dropPlace(2, { h: 0, after: false })).toBe(0)
    expect(dropPlace(2, { h: 2, after: true })).toBe(2)
    expect(dropPlace(2, { h: 2, after: false })).toBe(2)
  })
})
