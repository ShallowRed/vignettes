import { EditorState } from '@codemirror/state'
import { describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { collabUndoKeys, collabWriteGate } from '../../layers/studio/src/utils/collab-write-gate'

describe('collabWriteGate', () => {
  const insert = (state: EditorState) => state.update({ changes: { from: 0, insert: 'x' } }).state.doc.toString()

  it('holds a local change while the gate is closed, and lets it through once open', () => {
    let open = false
    const state = EditorState.create({ extensions: collabWriteGate(new Y.Doc(), () => open) })
    expect(insert(state)).toBe('')
    open = true
    expect(insert(state)).toBe('x')
  })

  it('lets through the changes dispatched from the observers of the Y.Doc, gate closed', () => {
    const doc = new Y.Doc()
    const state = EditorState.create({ extensions: collabWriteGate(doc, () => false) })
    let applied = ''
    doc.getText('codemirror').observe(() => {
      applied = insert(state)
    })
    doc.getText('codemirror').insert(0, 'synced')
    expect(applied).toBe('x')
    expect(insert(state)).toBe('')
  })
})

describe('collabUndoKeys', () => {
  it('runs the undo of y-codemirror in a writable editor, and nothing in a read-only one', () => {
    const run = vi.fn(() => true)
    const [key] = collabUndoKeys([{ key: 'Mod-z', run }])
    const view = (readOnly: boolean) => ({ state: { readOnly } }) as unknown as Parameters<NonNullable<typeof key.run>>[0]
    expect(key!.run!(view(true))).toBe(true)
    expect(run).not.toHaveBeenCalled()
    expect(key!.run!(view(false))).toBe(true)
    expect(run).toHaveBeenCalledOnce()
  })
})
