import { describe, expect, it } from 'vitest'
import { isDeckSlug, prepareDeckWrite } from '../../shared/deck/source'

describe('prepareDeckWrite', () => {
  it('derives the flat storage key from the slug', () => {
    const prepared = prepareDeckWrite({ slug: 'my-deck', raw: '# x' })
    expect(prepared.key).toBe('my-deck.md')
    expect(prepared.slug).toBe('my-deck')
    expect(prepared.raw).toBe('# x')
  })

  it('rejects slugs with path traversal or slashes', () => {
    for (const slug of ['../etc/passwd', 'a/b', '.hidden', 'a:b', ''])
      expect(() => prepareDeckWrite({ slug, raw: 'x' })).toThrow(/invalid slug/i)
  })

  it('accepts typical slugs (letters, digits, dash, underscore)', () => {
    for (const slug of ['deck', 'my-deck', 'deck_2', 'annual-review-2026', 'A1'])
      expect(prepareDeckWrite({ slug, raw: 'x' }).slug).toBe(slug)
  })

  it('refuses to write empty markdown (would wipe the deck)', () => {
    expect(() => prepareDeckWrite({ slug: 'd', raw: '' }))
      .toThrow(/empty markdown/i)
  })
})

describe('isDeckSlug', () => {
  it('accepts valid slugs', () => {
    for (const slug of ['deck', 'my-deck', 'deck_2', 'A1'])
      expect(isDeckSlug(slug)).toBe(true)
  })

  it('rejects traversal, separators and empty names', () => {
    for (const name of ['../etc/passwd', 'a/b', '.hidden', 'public:deck', 'a b', ''])
      expect(isDeckSlug(name)).toBe(false)
  })
})
