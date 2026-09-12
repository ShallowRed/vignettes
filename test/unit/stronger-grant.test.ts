import { describe, expect, it } from 'vitest'
import { strongerGrant } from '../../layers/studio/shared/access/roles'

describe('strongerGrant — folding a deck grant with its project grant', () => {
  it('returns the only grant when just one scope is set', () => {
    expect(strongerGrant('viewer', undefined)).toBe('viewer')
    expect(strongerGrant(undefined, 'editor')).toBe('editor')
    expect(strongerGrant(undefined, undefined)).toBeUndefined()
  })

  it('lets editor win over viewer whichever scope holds it', () => {
    expect(strongerGrant('viewer', 'editor')).toBe('editor')
    expect(strongerGrant('editor', 'viewer')).toBe('editor')
  })

  it('keeps the grant when both scopes agree', () => {
    expect(strongerGrant('viewer', 'viewer')).toBe('viewer')
    expect(strongerGrant('editor', 'editor')).toBe('editor')
  })
})
