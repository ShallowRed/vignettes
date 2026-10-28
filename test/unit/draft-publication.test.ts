import { describe, expect, it } from 'vitest'
import { draftChanges, draftUnpublished } from '../../layers/studio/src/utils/draft-publication'

describe('draftUnpublished', () => {
  it('is unknown until the draft is read, and true for a deck never published', () => {
    expect(draftUnpublished(null, 'a')).toBeNull()
    expect(draftUnpublished('a', null)).toBe(true)
  })

  it('compares the draft with the published text', () => {
    expect(draftUnpublished('a', 'a')).toBe(false)
    expect(draftUnpublished('a\nb', 'a')).toBe(true)
  })
})

describe('draftChanges', () => {
  it('counts no line while either text is unknown', () => {
    expect(draftChanges(null, 'a')).toBe(0)
    expect(draftChanges('a', null)).toBe(0)
  })

  it('counts the lines changed since the published text', () => {
    expect(draftChanges('a\nB\nc', 'a\nb\nc')).toBe(2)
  })
})
