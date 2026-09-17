import { describe, expect, it } from 'vitest'
import { diffStructure } from '../../layers/studio/src/utils/diff-skeleton'

const lines = (n: number, prefix = 'line') => Array.from({ length: n }, (_, i) => `${prefix} ${i + 1}`)

describe('diffStructure', () => {
  it('folds the identical head and tail around a change, with the removed lines before the added ones', () => {
    const before = [...lines(10), 'old a', 'old b', ...lines(10, 'tail')].join('\n')
    const after = [...lines(10), 'new a', ...lines(10, 'tail')].join('\n')
    const { rows, chunks, digits } = diffStructure(before, after)
    expect(chunks).toBe(1)
    expect(digits).toBe(2)
    expect(rows.filter(r => r.kind === 'line').map(r => r.kind === 'line' && r.number)).toEqual([8, 9, 10, undefined, undefined, 11, 12, 13, 14])
    expect(rows.map(r => r.kind === 'band' ? 'band' : `${r.tone}:${r.text}`)).toEqual([
      'band',
      'context:line 8',
      'context:line 9',
      'context:line 10',
      'removed:old a',
      'removed:old b',
      'added:new a',
      'context:tail 1',
      'context:tail 2',
      'context:tail 3',
      'band',
    ])
  })

  it('shows two identical texts as plain context', () => {
    const text = lines(5).join('\n')
    const { rows, chunks } = diffStructure(text, text)
    expect(chunks).toBe(0)
    expect(rows.map(r => r.kind === 'line' && r.tone)).toEqual(Array.from({ length: 5 }, () => 'context'))
  })

  it('keeps the text of a line whole, the editor wrapping it itself', () => {
    const { rows } = diffStructure('a', 'x'.repeat(250))
    expect(rows).toEqual([{ kind: 'line', tone: 'removed', text: 'a' }, { kind: 'line', tone: 'added', text: 'x'.repeat(250), number: 1 }])
  })
})
