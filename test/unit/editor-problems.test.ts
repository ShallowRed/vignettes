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

  it('gives a line and a short text to the problems the editor lists', () => {
    const doc = '---\ntitle: T\ntheme: inconnu\nstorybook: http://sb.example\nreveal:\n  width: large\n---\n# T'
    const state = EditorState.create({ doc })
    const problems = frontmatterProblems(state, (key: string, params?: unknown) => params ? `${key} ${JSON.stringify(params)}` : key)
    expect(problems.map(({ from, to, severity, short }) => [state.sliceDoc(from, to), severity, short?.split(' ')[0]])).toEqual([
      ['inconnu', 'warning', 'editor.frontmatter.unknownThemeShort'],
      ['http://sb.example', 'warning', 'editor.diagnostics.refusedEmbedShort'],
      ['large', 'error', 'editor.frontmatter.invalidValueShort'],
    ])
    expect(problems[2]!.message).toBe('editor.frontmatter.expected.number')
  })

  it('marks a theme published with other theme packages than the studio', () => {
    const state = EditorState.create({ doc: '---\ntitle: T\ntheme: dsfr\n---\n# T' })
    const problems = frontmatterProblems(state, key => key, ['dsfr'])
    expect(problems.map(({ from, to, short }) => [state.sliceDoc(from, to), short])).toEqual([['dsfr', 'editor.frontmatter.themeVersionGapShort']])
  })

  it('asks to quote a value that holds a colon', () => {
    const state = EditorState.create({ doc: '---\ntitle: Revue de sprint : bilan\n---\n# T' })
    const problems = frontmatterProblems(state, (key: string, params?: unknown) => params ? `${key} ${JSON.stringify(params)}` : key)
    expect(problems.map(({ message, short }) => [message, short])).toEqual([
      ['editor.frontmatter.quoteValue {"line":"title: \\"Revue de sprint : bilan\\""}', 'editor.frontmatter.quoteValueShort {"line":2}'],
    ])
  })

  it('marks a heading inside a header whose closing line is missing', () => {
    for (const doc of ['---\ntitle: T\ntheme: dsfr\n\n# Titre\n\n---\n## Section', '---\ntitle: T\n\n# Titre\n\nObjectif : réduire les délais\n\n---\n## Section']) {
      const state = EditorState.create({ doc })
      const problems = frontmatterProblems(state, key => key)
      expect(problems.map(({ from, to, message }) => [state.sliceDoc(from, to), message])).toEqual([['# Titre', 'editor.frontmatter.unclosed']])
    }
  })

  it('reads a # line followed by keys as a comment', () => {
    const state = EditorState.create({ doc: '---\n# Réglages\n# de la présentation\ntitle: T\n---\n# Titre' })
    expect(frontmatterProblems(state, key => key)).toEqual([])
  })
})
