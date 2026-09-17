import { describe, expect, it } from 'vitest'
import { familyFolder, replacementLoops, variantsOf } from '../../layers/studio/shared/presentations/family'

const decks = [
  { slug: 'a', project: 'p1', family: 'Talk', supersededBy: null },
  { slug: 'a-en', project: 'p1', family: 'Talk', supersededBy: null },
  { slug: 'a-old', project: 'p1', family: 'Talk', supersededBy: 'a' },
  { slug: 'b', project: 'p2', family: null, supersededBy: null },
]

describe('replacementLoops', () => {
  it('refuses a deck replacing itself or a deck it already replaces', () => {
    expect(replacementLoops('a', 'a', decks)).toBe(true)
    expect(replacementLoops('a', 'a-old', decks)).toBe(true)
    expect(replacementLoops('b', 'a', decks)).toBe(false)
  })

  it('follows a chain of replacements back to the deck', () => {
    // v1 is replaced by v2, itself replaced by v3: v3 cannot be replaced by v1.
    const chain = [{ slug: 'v1', supersededBy: 'v2' }, { slug: 'v2', supersededBy: 'v3' }, { slug: 'v3', supersededBy: null }]
    expect(replacementLoops('v3', 'v1', chain)).toBe(true)
    expect(replacementLoops('v1', 'v3', chain)).toBe(false)
  })

  it('ends on a stored loop instead of spinning', () => {
    const looped = [{ slug: 'x', supersededBy: 'y' }, { slug: 'y', supersededBy: 'x' }]
    expect(replacementLoops('z', 'x', looped)).toBe(false)
  })
})

describe('familyFolder', () => {
  it('names the folder of the other members, or nothing for a new family', () => {
    expect(familyFolder('Talk', 'a', decks)).toBe('p1')
    expect(familyFolder('Talk', 'c', decks)).toBe('p1')
    expect(familyFolder('Nouvelle', 'c', decks)).toBeUndefined()
  })
})

describe('variantsOf', () => {
  it('lists the live members of the family, the deck included', () => {
    expect(variantsOf('a', decks).map(d => d.slug)).toEqual(['a', 'a-en'])
    expect(variantsOf('b', decks)).toEqual([])
  })
})
