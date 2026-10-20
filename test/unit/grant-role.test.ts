import { describe, expect, it } from 'vitest'
import { mayChangeRole } from '../../layers/studio/src/utils/grant-role'

const day = (n: number) => new Date(Date.UTC(2026, 0, n))

describe('mayChangeRole', () => {
  it('changes no role while the sharer\'s limit is not known', () => {
    expect(mayChangeRole(undefined, { role: 'viewer', expiresAt: day(10).toISOString() }, 'editor')).toBe(false)
    expect(mayChangeRole(undefined, { role: 'editor', expiresAt: null }, 'viewer')).toBe(false)
  })

  it('raises to editor only a grant that ends by the sharer\'s limit', () => {
    expect(mayChangeRole(day(20), { role: 'viewer', expiresAt: null }, 'editor')).toBe(false)
    expect(mayChangeRole(day(20), { role: 'viewer', expiresAt: day(25).toISOString() }, 'editor')).toBe(false)
    expect(mayChangeRole(day(20), { role: 'viewer', expiresAt: day(15).toISOString() }, 'editor')).toBe(true)
  })

  it('lowers any grant, and raises any grant for a sharer without a limit', () => {
    expect(mayChangeRole(day(20), { role: 'editor', expiresAt: null }, 'viewer')).toBe(true)
    expect(mayChangeRole(null, { role: 'viewer', expiresAt: null }, 'editor')).toBe(true)
  })
})
