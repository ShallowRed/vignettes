import { describe, expect, it } from 'vitest'
import { changedLines } from '../../layers/studio/src/utils/changed-lines'

describe('changedLines', () => {
  it('counts the removed and the added lines', () => {
    expect(changedLines('a\nb\nc', 'a\nb\nc')).toBe(0)
    expect(changedLines('a\nb\nc', 'a\nB\nc')).toBe(2)
    expect(changedLines('a\nb', 'a\nb\nc\nd')).toBe(2)
    expect(changedLines('a\nb\nc', 'a')).toBe(2)
  })
})
