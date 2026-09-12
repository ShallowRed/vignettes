import { describe, expect, it } from 'vitest'
import { markdownToYDocUpdate, yDocUpdateToMarkdown } from '../../layers/studio/shared/collab/ydoc'

describe('deck ydoc helpers', () => {
  it('round-trips markdown through a Y.Doc update', () => {
    const raw = '---\ntitle: T\n---\n\n# Un deck\n\nAvec des accents é à ü.'
    expect(yDocUpdateToMarkdown(markdownToYDocUpdate(raw))).toBe(raw)
  })

  it('handles the empty document', () => {
    expect(yDocUpdateToMarkdown(markdownToYDocUpdate(''))).toBe('')
  })
})
