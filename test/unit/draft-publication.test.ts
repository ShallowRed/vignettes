import { describe, expect, it } from 'vitest'
import { draftUnpublished } from '../../layers/studio/src/utils/draft-publication'

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
