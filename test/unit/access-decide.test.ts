import type { AccessInput } from '../../layers/studio/shared/access/decide'
import type { Role } from '../../layers/studio/shared/access/roles'
import type { PublicationStatus } from '../../layers/studio/shared/access/status'
import { describe, expect, it } from 'vitest'
import { canList, decideAccess } from '../../layers/studio/shared/access/decide'

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
