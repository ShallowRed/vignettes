import { resolveDeck, splitFrontmatter } from '@vignettes/core/deck'
import { describe, expect, it } from 'vitest'

describe('resolveDeck — stub frontmatter is the only truth', () => {
  const stub = [
    '---',
    'theme: brand',
    'storybook: https://public.example',
    'access: public',
    'reveal:',
    '  margin: 0.2',
    '---',
    '',
    '# Stub body',
  ].join('\n')

  it('parses the stub frontmatter and keeps its body', () => {
    const deck = resolveDeck({ stub })
    expect(deck.meta.theme).toBe('brand')
    expect(deck.meta.storybook).toBe('https://public.example')
    expect(deck.meta.access).toBe('public')
    expect(deck.meta.reveal).toMatchObject({ margin: 0.2 })
    expect(deck.body).toBe('\n# Stub body')
    expect(deck.provenance).toMatchObject({ bodyFrom: 'stub', layers: ['stub'] })
  })

  it('records an unknown theme as a warning instead of rejecting it', () => {
    const deck = resolveDeck({ stub: '---\ntheme: not-a-theme\n---\n\nbody' })
    expect(deck.meta.theme).toBe('not-a-theme')
    expect(deck.provenance.warnings.some(w => w.includes('not-a-theme'))).toBe(true)
  })

  it('yields an empty body and no layers when there is no stub', () => {
    const deck = resolveDeck({})
    expect(deck.body).toBe('')
    expect(deck.provenance).toMatchObject({ bodyFrom: 'none', layers: [] })
  })
})

describe('resolveDeck — wire content is parseable back to the same meta', () => {
  it('content round-trips: client re-parsing yields the resolved meta', () => {
    const stub = '---\ntheme: brand\nreveal:\n  margin: 0.2\n---\n\n# x'
    const deck = resolveDeck({ stub })
    const reparsed = splitFrontmatter(deck.content).data
    expect(reparsed.theme).toBe('brand')
    expect((reparsed.reveal as any).margin).toBe(0.2)
  })
})

describe('resolveDeck — storybook base override (frozen bundles)', () => {
  it('rewrites the storybook base so a bundle embeds its own copy', () => {
    const stub = '---\nstorybook: https://design.example\n---\n\n# x'
    const deck = resolveDeck({ stub, storybookBase: '/frozen/talk/_storybook' })
    expect(deck.meta.storybook).toBe('/frozen/talk/_storybook')
    expect(splitFrontmatter(deck.content).data.storybook).toBe('/frozen/talk/_storybook')
  })

  it('leaves a deck without story embeds alone', () => {
    const deck = resolveDeck({ stub: '---\ntheme: dsfr\n---\n\n# x', storybookBase: '/frozen/talk/_storybook' })
    expect(deck.meta.storybook).toBeUndefined()
  })

  it('keeps the deck own base when no override is given', () => {
    const deck = resolveDeck({ stub: '---\nstorybook: https://design.example\n---\n\n# x' })
    expect(deck.meta.storybook).toBe('https://design.example')
  })
})
