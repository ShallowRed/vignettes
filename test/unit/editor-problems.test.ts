import { EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { placeProblems } from '../../layers/studio/src/utils/editor-problems'

describe('placeProblems', () => {
  it('marks the written name, and leaves out a line beyond the end of the text', () => {
    const state = EditorState.create({ doc: 'a\n::Callout\nlast' })
    const problems = placeProblems(state, [
      { line: 2, column: 0, length: 9, severity: 'warning', message: 'unknown' },
      { line: 9, column: 0, length: 4, severity: 'warning', message: 'beyond' },
    ])
    expect(problems.map(({ from, to }) => state.sliceDoc(from, to))).toEqual(['::Callout'])
  })
})
