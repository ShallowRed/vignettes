import { beforeEach, describe, expect, it } from 'vitest'
import { hitRateLimit, resetRateLimits } from '../../server/utils/rate-limit'

describe('hitRateLimit', () => {
  beforeEach(resetRateLimits)

  it('allows up to the limit, then blocks within the window', () => {
    const attempt = () => hitRateLimit('k', 3, 1000, 0)
    expect([attempt(), attempt(), attempt()]).toEqual([true, true, true])
    expect(attempt()).toBe(false)
  })

  it('resets once the window has elapsed', () => {
    expect(hitRateLimit('k', 1, 1000, 0)).toBe(true)
    expect(hitRateLimit('k', 1, 1000, 500)).toBe(false)
    expect(hitRateLimit('k', 1, 1000, 1000)).toBe(true)
  })

  it('keys are independent', () => {
    expect(hitRateLimit('a', 1, 1000, 0)).toBe(true)
    expect(hitRateLimit('a', 1, 1000, 0)).toBe(false)
    expect(hitRateLimit('b', 1, 1000, 0)).toBe(true)
  })
})
