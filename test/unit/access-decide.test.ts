import type { AccessInput } from '../../layers/studio/shared/access/decide'
import type { Role } from '../../layers/studio/shared/access/roles'
import type { PublicationStatus } from '../../layers/studio/shared/access/status'
import { describe, expect, it } from 'vitest'
import { canList, canShare, decideAccess, mayGrantUntil, mayWriteGrantOf, sharingLimit } from '../../layers/studio/shared/access/decide'

const STATUSES: PublicationStatus[] = ['public', 'private', 'semi-private']
// A value outside the enum (e.g. the retired 'draft') must fail closed everywhere.
const LEGACY_STATUS = 'draft' as PublicationStatus

function input(over: Partial<AccessInput> & Pick<AccessInput, 'status' | 'role'>): AccessInput {
  return { hasPassword: false, passwordGranted: false, ...over }
}

describe('decideAccess — view matrix', () => {
  it('denies private to anonymous as auth-required, to a signed-in viewer as forbidden (sign in vs refused)', () => {
    expect(decideAccess(input({ status: 'private', role: 'anonymous' })))
      .toEqual({ outcome: 'deny', reason: 'auth-required' })
    expect(decideAccess(input({ status: 'private', role: 'viewer' })))
      .toEqual({ outcome: 'deny', reason: 'forbidden' })
  })

  it('a status outside the enum fails closed for view', () => {
    expect(decideAccess(input({ status: LEGACY_STATUS, role: 'viewer' })))
      .toEqual({ outcome: 'deny', reason: 'forbidden' })
  })
})

describe('decideAccess — semi-private password gate', () => {
  it('denies (fail-closed) when no password hash is declared', () => {
    expect(decideAccess(input({ status: 'semi-private', role: 'anonymous', hasPassword: false })))
      .toEqual({ outcome: 'deny', reason: 'auth-required' })
    expect(decideAccess(input({ status: 'semi-private', role: 'viewer', hasPassword: false })))
      .toEqual({ outcome: 'deny', reason: 'forbidden' })
  })

  it('needs password when a hash is declared and not yet granted', () => {
    expect(decideAccess(input({ status: 'semi-private', role: 'viewer', hasPassword: true, passwordGranted: false })))
      .toEqual({ outcome: 'needs-password' })
  })

  it('allows once the password is granted', () => {
    expect(decideAccess(input({ status: 'semi-private', role: 'anonymous', hasPassword: true, passwordGranted: true })).outcome)
      .toBe('allow')
  })

  it('lets privileged roles skip the password gate', () => {
    expect(decideAccess(input({ status: 'semi-private', role: 'owner', hasPassword: true, passwordGranted: false })).outcome)
      .toBe('allow')
  })
})

describe('canList', () => {
  it('shows everything to privileged roles', () => {
    for (const status of STATUSES) {
      expect(canList({ status, role: 'owner', unlisted: true, lifecycle: 'archived' })).toBe(true)
      expect(canList({ status, role: 'editor' })).toBe(true)
    }
  })

  it('shows only public to non-privileged; semi-private/legacy/private are hidden', () => {
    for (const role of ['anonymous', 'viewer'] as Role[]) {
      expect(canList({ status: 'public', role })).toBe(true)
      // Semi-private titles must not leak to the public showcase (reached by link only).
      expect(canList({ status: 'semi-private', role })).toBe(false)
      expect(canList({ status: LEGACY_STATUS, role })).toBe(false)
      expect(canList({ status: 'private', role })).toBe(false)
    }
  })

  it('hides unlisted and archived decks from non-privileged', () => {
    expect(canList({ status: 'public', role: 'anonymous', unlisted: true })).toBe(false)
    expect(canList({ status: 'public', role: 'viewer', lifecycle: 'archived' })).toBe(false)
  })
})

describe('decideAccess — per-deck grants', () => {
  it('opens view on private decks for any grant', () => {
    for (const grant of ['editor', 'viewer'] as const) {
      expect(decideAccess(input({ status: 'private', role: 'viewer', grant })).outcome).toBe('allow')
      expect(decideAccess(input({ status: LEGACY_STATUS, role: 'viewer', grant })).outcome).toBe('allow')
    }
  })

  it('opens edit only for an editor grant', () => {
    expect(decideAccess(input({ status: 'private', role: 'viewer', action: 'edit', grant: 'editor' })).outcome)
      .toBe('allow')
    expect(decideAccess(input({ status: 'private', role: 'viewer', action: 'edit', grant: 'viewer' })))
      .toEqual({ outcome: 'deny', reason: 'forbidden' })
  })

  it('never opens admin through a grant', () => {
    expect(decideAccess(input({ status: 'public', role: 'viewer', action: 'admin', grant: 'editor' })))
      .toEqual({ outcome: 'deny', reason: 'forbidden' })
  })

  it('bypasses the semi-private password for the grantee', () => {
    expect(decideAccess(input({ status: 'semi-private', role: 'viewer', grant: 'viewer', hasPassword: true })).outcome)
      .toBe('allow')
  })

  it('lists granted decks even when private or unlisted', () => {
    expect(canList({ status: 'private', role: 'viewer', grant: 'viewer' })).toBe(true)
    expect(canList({ status: 'public', role: 'viewer', unlisted: true, grant: 'editor' })).toBe(true)
  })
})

describe('canShare', () => {
  it('lets the owner and a global editor share any deck', () => {
    expect(canShare('owner')).toBe(true)
    expect(canShare('editor')).toBe(true)
  })

  it('lets a viewer share a deck they hold an editor grant on, from the deck or its folder', () => {
    expect(canShare('viewer', 'editor')).toBe(true)
  })

  it('refuses a read-only grant, a viewer without grant and an anonymous visitor', () => {
    expect(canShare('viewer', 'viewer')).toBe(false)
    expect(canShare('viewer')).toBe(false)
    expect(canShare('anonymous')).toBe(false)
  })
})

describe('mayWriteGrantOf', () => {
  it('lets the owner write any grant, their own included', () => {
    expect(mayWriteGrantOf({ role: 'owner', id: 1 }, 1)).toBe(true)
    expect(mayWriteGrantOf({ role: 'owner', id: 1 }, 2)).toBe(true)
  })

  it('lets another sharer write the grant of someone else, never their own', () => {
    expect(mayWriteGrantOf({ role: 'editor', id: 3 }, 2)).toBe(true)
    expect(mayWriteGrantOf({ role: 'viewer', id: 10 }, 2)).toBe(true)
    expect(mayWriteGrantOf({ role: 'editor', id: 3 }, 3)).toBe(false)
    expect(mayWriteGrantOf({ role: 'viewer', id: 10 }, 10)).toBe(false)
  })
})

describe('sharingLimit', () => {
  const now = new Date('2026-10-21T12:00:00Z')
  const inDays = (n: number) => new Date(now.getTime() + n * 86_400_000)

  it('puts no limit on a global role or a permanent editor grant', () => {
    expect(sharingLimit('editor', [], now)).toBeNull()
    expect(sharingLimit('viewer', [{ role: 'editor', expiresAt: inDays(3) }, { role: 'editor', expiresAt: null }], now)).toBeNull()
  })

  it('takes the latest live editor grant, from the deck or its folder', () => {
    expect(sharingLimit('viewer', [{ role: 'editor', expiresAt: inDays(3) }, { role: 'editor', expiresAt: inDays(10).toISOString() }], now)).toEqual(inDays(10))
  })

  it('ignores a viewer grant and an expired one, and closes on none left', () => {
    expect(sharingLimit('viewer', [{ role: 'viewer', expiresAt: null }, { role: 'editor', expiresAt: inDays(-1) }, undefined], now)).toEqual(now)
  })
})

describe('mayGrantUntil', () => {
  const day = (n: number) => new Date(Date.UTC(2026, 9, n))
  const viewer = (expiresAt: Date | null) => ({ role: 'viewer' as const, expiresAt })
  const editor = (expiresAt: Date | null) => ({ role: 'editor' as const, expiresAt })

  it('accepts any expiry without a limit', () => {
    expect(mayGrantUntil(null, editor(null))).toBe(true)
    expect(mayGrantUntil(null, viewer(day(30)))).toBe(true)
  })

  it('keeps a new grant within the limit, never permanent', () => {
    expect(mayGrantUntil(day(20), viewer(day(20)))).toBe(true)
    expect(mayGrantUntil(day(20), viewer(day(21)))).toBe(false)
    expect(mayGrantUntil(day(20), viewer(null))).toBe(false)
  })

  it('lets an existing grant keep or shorten its term without raising its role, never extend it past the limit', () => {
    expect(mayGrantUntil(day(20), viewer(null), viewer(null))).toBe(true)
    expect(mayGrantUntil(day(20), editor(day(25)), editor(day(28)))).toBe(true)
    expect(mayGrantUntil(day(20), viewer(day(25)), editor(day(28)))).toBe(true)
    expect(mayGrantUntil(day(20), viewer(day(28)), viewer(day(25)))).toBe(false)
    expect(mayGrantUntil(day(20), viewer(null), viewer(day(25)))).toBe(false)
  })

  it('holds a raised role to the limit, whatever the term it had', () => {
    expect(mayGrantUntil(day(20), editor(null), viewer(null))).toBe(false)
    expect(mayGrantUntil(day(20), editor(day(25)), viewer(day(28)))).toBe(false)
    expect(mayGrantUntil(day(20), editor(day(20)), viewer(null))).toBe(true)
  })
})
