import { describe, expect, it } from 'vitest'
import { countAudience } from '../../layers/studio/src/utils/audience'

const now = new Date(Date.UTC(2026, 0, 10))
const live = { role: 'viewer' as const, expiresAt: null }
const expired = { role: 'editor' as const, expiresAt: new Date(Date.UTC(2026, 0, 5)).toISOString() }

describe('countAudience', () => {
  it('gives no count while either list is in error', () => {
    expect(countAudience(undefined, [live], now)).toEqual({ variant: 'uncounted' })
    expect(countAudience([live], undefined, now)).toEqual({ variant: 'uncounted' })
  })

  it('counts the live grants of each list', () => {
    expect(countAudience([live, live, expired], [live], now)).toEqual({ variant: 'both', direct: 2, folder: 1 })
    expect(countAudience([live], [expired], now)).toEqual({ variant: 'direct', direct: 1, folder: 0 })
    expect(countAudience([], [live], now)).toEqual({ variant: 'folder', direct: 0, folder: 1 })
    expect(countAudience([expired], [], now)).toEqual({ variant: 'alone', direct: 0, folder: 0 })
  })
})
