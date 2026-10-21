import { EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { frontmatterProblems } from '../../layers/studio/src/utils/editor-frontmatter'
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

describe('frontmatterProblems', () => {
  it('marks a storybook address the deck refuses', () => {
    const state = EditorState.create({ doc: '---\ntitle: T\nstorybook: javascript:alert(1)\n---\n# T' })
    const problems = frontmatterProblems(state, key => key)
    expect(problems.map(({ from, to, message }) => [state.sliceDoc(from, to), message])).toEqual([
      ['javascript:alert(1)', 'editor.diagnostics.refusedUrl'],
    ])
  })

  it('marks a reveal option the deck does not pass to Reveal', () => {
    const state = EditorState.create({ doc: '---\ntitle: T\nreveal:\n  backgroundTransition: fade\n  dependencies: []\n---\n# T' })
    const problems = frontmatterProblems(state, key => key)
    expect(problems.map(({ from, to, severity }) => [state.sliceDoc(from, to), severity])).toEqual([['dependencies', 'info']])
  })
})
