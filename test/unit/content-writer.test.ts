import { describe, expect, it } from 'vitest'
import { prepareDeckWrite, WRITABLE_ACCESS_FOLDERS } from '../../shared/deck/source'

describe('prepareDeckWrite', () => {
  it('derives the storage key from access + slug', () => {
    const prepared = prepareDeckWrite({ access: 'public', slug: 'my-deck', raw: '# x' })
    expect(prepared.key).toBe('public:my-deck.md')
    expect(prepared.access).toBe('public')
    expect(prepared.slug).toBe('my-deck')
    expect(prepared.raw).toBe('# x')
  })

  it('accepts every writable access folder', () => {
    for (const access of WRITABLE_ACCESS_FOLDERS) {
      const prepared = prepareDeckWrite({ access, slug: 'd', raw: 'x' })
      expect(prepared.key).toBe(`${access}:d.md`)
    }
  })

  it('rejects an unknown access folder', () => {
    expect(() => prepareDeckWrite({ access: 'secret', slug: 'd', raw: 'x' }))
      .toThrow(/invalid access folder/i)
  })

  it('rejects slugs with path traversal or slashes', () => {
    expect(() => prepareDeckWrite({ access: 'public', slug: '../etc/passwd', raw: 'x' }))
      .toThrow(/invalid slug/i)
    expect(() => prepareDeckWrite({ access: 'public', slug: 'a/b', raw: 'x' }))
      .toThrow(/invalid slug/i)
    expect(() => prepareDeckWrite({ access: 'public', slug: '.hidden', raw: 'x' }))
      .toThrow(/invalid slug/i)
  })

  it('accepts typical slugs (letters, digits, dash, underscore)', () => {
    for (const slug of ['deck', 'my-deck', 'deck_2', 'annual-review-2026', 'A1'])
      expect(prepareDeckWrite({ access: 'draft', slug, raw: 'x' }).slug).toBe(slug)
  })

  it('refuses to write empty markdown (would wipe the deck)', () => {
    expect(() => prepareDeckWrite({ access: 'public', slug: 'd', raw: '' }))
      .toThrow(/empty markdown/i)
  })
})
