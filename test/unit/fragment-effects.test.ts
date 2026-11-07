import { describe, expect, it } from 'vitest'
import { fragmentEffects } from '../../packages/nuxt/src/runtime/utils/fragment-effects.ts'

describe('fragmentEffects', () => {
  it('adds no class for an empty effect, and one per effect separated by spaces', () => {
    expect(fragmentEffects('')).toEqual([])
    expect(fragmentEffects('fade-in')).toEqual([])
    expect(fragmentEffects(' fade-up  grow ')).toEqual(['fade-up', 'grow'])
  })
})
