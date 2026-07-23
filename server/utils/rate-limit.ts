/**
 * Minimal in-memory fixed-window rate limiter. Enough for a single-instance
 * deployment (the whole app already runs off one SQLite file); a multi-instance
 * setup would need a shared store instead.
 */

interface Window {
  count: number
  resetAt: number
}

const windows = new Map<string, Window>()

/**
 * Record one attempt for `key`. Returns true while the key stays within `limit`
 * attempts per `windowMs`, false once it is over. Expired windows reset on the
 * next attempt, and stale entries are pruned opportunistically so the map cannot
 * grow without bound.
 */
export function hitRateLimit(key: string, limit: number, windowMs: number, now: number = Date.now()): boolean {
  const current = windows.get(key)

  if (!current || now >= current.resetAt) {
    if (windows.size > 10_000)
      prune(now)
    windows.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }

  current.count += 1
  return current.count <= limit
}

function prune(now: number): void {
  for (const [key, window] of windows) {
    if (now >= window.resetAt)
      windows.delete(key)
  }
}

/** Test-only: drop all recorded windows. */
export function resetRateLimits(): void {
  windows.clear()
}
