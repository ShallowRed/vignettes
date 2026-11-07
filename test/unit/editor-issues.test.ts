import type { PreviewFindings } from '../../layers/studio/src/utils/editor-issues'
import { EditorState } from '@codemirror/state'
import { checkDeck } from '@vignettes/core/deck'
import { describe, expect, it } from 'vitest'
import { editorIssues } from '../../layers/studio/src/utils/editor-issues'

const t = ((key: string) => key) as Parameters<typeof editorIssues>[2]
const none: PreviewFindings = { overflow: null, brokenImages: [], frontmatter: [], unknown: [], deck: [], rendering: [] }

describe('editorIssues', () => {
  it('lists the errors first, then by line', () => {
    const issues = editorIssues('a\nb\nc', {
      ...none,
      overflow: { line: 1, slide: 1 },
      deck: [
        { check: 'legacy', severity: 'info', form: 'center', line: 1, column: 0, length: 1, changes: [] },
        { check: 'unclosed', severity: 'error', name: 'Columns', colons: ':::', line: 2, column: 0, length: 10 },
        { check: 'layout', severity: 'error', kind: 'missing-source', attribute: 'src', line: 3, column: 0, length: 3 },
      ],
    }, t, 'fr', () => undefined)
    expect(issues.map(issue => [issue.severity, issue.line])).toEqual([['error', 2], ['error', 3], ['warning', 1], ['info', 1]])
  })

  it('reports a directive whose attributes cannot be read once, as malformed', () => {
    const issues = editorIssues('::Quote{author="X}', {
      ...none,
      deck: [{ check: 'malformed', severity: 'error', name: 'Quote', reason: 'quote', line: 1, column: 0, length: 18 }],
      unknown: [{ name: 'Quote', line: 1, column: 0, length: 7 }],
    }, t, 'fr', () => undefined)
    expect(issues.map(issue => issue.message)).toEqual(['editor.diagnostics.malformedAttributes.quote'])
  })

  it('reports a component the preview could not render as an error, with the reference of the component', () => {
    const [issue] = editorIssues(':i{}', {
      ...none,
      rendering: [{ name: 'i', line: 1, column: 0, length: 2 }],
    }, t, 'fr', docs => docs)
    expect(issue).toMatchObject({ line: 1, severity: 'error', short: 'editor.diagnostics.renderFailedShort', message: 'editor.diagnostics.renderFailed', docs: '/reference/nuxt#iconinline' })
  })

  it('states a legacy form in the interface language and offers its conversion for the text as it stands', () => {
    const raw = '---\ntitle: A\ncenter: true\n---\n'
    const [issue] = editorIssues(raw, { ...none, deck: checkDeck(raw) }, t, 'en', () => undefined)
    expect(issue).toMatchObject({ line: 3, severity: 'info', short: 'editor.diagnostics.legacyShort', fix: { label: 'editor.convert' } })
    expect(issue!.message).toContain('`align` attribute of `:layout`')
    const state = EditorState.create({ doc: raw })
    expect(state.update(issue!.fix!.change(state, state.doc.line(3).from)!).state.doc.toString()).toBe('---\ntitle: A\n---\n')
  })
})
