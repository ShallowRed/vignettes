import { isDeckSlug, prepareDeckWrite } from '@vignettes/core/deck'
import { describe, expect, it } from 'vitest'

describe('isDeckSlug', () => {
  it('accepts letters, digits, dash and underscore', () => {
    for (const slug of ['deck', 'my-deck', 'deck_2', 'deck-2026', 'A1'])
      expect(isDeckSlug(slug)).toBe(true)
  })

  it('rejects traversal, separators, dotfiles, spaces and empty names', () => {
    for (const name of ['../etc/passwd', 'a/b', '.hidden', 'public:deck', 'a b', ''])
      expect(isDeckSlug(name)).toBe(false)
  })
})

describe('prepareDeckWrite', () => {
  it('derives the flat storage key from the slug', () => {
    expect(prepareDeckWrite({ slug: 'my-deck', raw: '# x' })).toEqual({ key: 'my-deck.md', slug: 'my-deck', raw: '# x' })
  })

  it('refuses an invalid slug and empty markdown (a blank save would wipe the deck)', () => {
    expect(() => prepareDeckWrite({ slug: 'a/b', raw: 'x' })).toThrow(/invalid slug/i)
    expect(() => prepareDeckWrite({ slug: 'd', raw: '' })).toThrow(/empty markdown/i)
  })
})
