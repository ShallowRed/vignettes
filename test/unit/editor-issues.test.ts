import type { PreviewFindings } from '../../layers/studio/src/utils/editor-issues'
import { describe, expect, it } from 'vitest'
import { editorIssues } from '../../layers/studio/src/utils/editor-issues'

const t = ((key: string) => key) as Parameters<typeof editorIssues>[2]
const none: PreviewFindings = { overflow: null, brokenImages: [], malformed: [], componentAttributes: [], unclosed: [], frontmatter: [], unknown: [], refused: [], layout: [] }

describe('editorIssues', () => {
  it('lists the errors first, then by line', () => {
    const issues = editorIssues('a\nb\nc', {
      ...none,
      overflow: { line: 1, slide: 1 },
      layout: [{ kind: 'legacy', attribute: '', line: 1, column: 0, length: 3 }, { kind: 'missing-source', attribute: 'src', line: 3, column: 0, length: 3 }],
      unclosed: [{ name: 'Columns', colons: ':::', line: 2, column: 0, length: 10 }],
    }, t, () => undefined)
    expect(issues.map(issue => [issue.severity, issue.line])).toEqual([['error', 2], ['error', 3], ['warning', 1], ['info', 1]])
  })

  it('reports a directive whose attributes cannot be read once, as malformed', () => {
    const issues = editorIssues('::Quote{author="X}', {
      ...none,
      malformed: [{ name: 'Quote', reason: 'quote', line: 1, column: 0, length: 18 }],
      unknown: [{ name: 'Quote', line: 1, column: 0, length: 7 }],
    }, t, () => undefined)
    expect(issues.map(issue => issue.message)).toEqual(['editor.diagnostics.malformedAttributes.quote'])
  })
})
