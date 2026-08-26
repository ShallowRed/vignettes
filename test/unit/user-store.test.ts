import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { users } from '../../server/db/schema'
import { createUserStore } from '../../server/db/user-store'
import { freshDb } from './helpers/db'

describe('user store', () => {
  let db: ReturnType<typeof freshDb>
  let store: ReturnType<typeof createUserStore>
  const alice = { id: 1, login: 'alice', name: 'Alice', avatarUrl: 'https://a.example/1' }

  beforeEach(() => {
    db = freshDb()
    store = createUserStore(db)
  })

  it('seeds a new user with the bootstrap role', async () => {
    await expect(store.upsertOnLogin(alice, 'owner')).resolves.toBe('owner')
    await expect(store.getRole(1)).resolves.toBe('owner')
  })

  it('keeps the stored role on re-login (database is the truth)', async () => {
    await store.upsertOnLogin(alice, 'owner')
    await store.setRole(1, 'viewer')
    // A later login with a stale env map must not restore the revoked privilege.
    await expect(store.upsertOnLogin(alice, 'owner')).resolves.toBe('viewer')
  })

  it('refreshes the profile on login without touching the role', async () => {
    await store.upsertOnLogin(alice, 'editor')
    await store.upsertOnLogin({ ...alice, login: 'alice-renamed', name: 'A.' }, 'viewer')
    const listed = await store.list()
    expect(listed).toHaveLength(1)
    expect(listed[0]).toMatchObject({ login: 'alice-renamed', name: 'A.', role: 'editor' })
  })

  it('returns null for an unknown user', async () => {
    await expect(store.getRole(404)).resolves.toBeNull()
  })

  it('degrades an invalid stored role to viewer', async () => {
    await store.upsertOnLogin(alice, 'owner')
    db.update(users).set({ role: 'superadmin' }).where(eq(users.id, 1)).run()
    await expect(store.getRole(1)).resolves.toBe('viewer')
  })

  it('two id-keyed accounts coexist under the provider-identity index', async () => {
    // upsertOnLogin must mirror the 0010 backfill: without a per-row providerId
    // the second insert would collide on ('github', '').
    await store.upsertOnLogin({ id: 900_000_001, login: 'dev-owner' }, 'owner')
    await expect(store.upsertOnLogin({ id: 900_000_002, login: 'dev-editor' }, 'editor')).resolves.toBe('editor')
  })

  describe('upsertOAuthLogin', () => {
    // A realistic Google sub: 21 digits, past Number.MAX_SAFE_INTEGER — it must
    // round-trip as a string with no precision loss.
    const SUB = '104858372634859273645'
    const carol = { provider: 'google' as const, providerId: SUB, login: 'carol@example.com', name: 'Carol' }

    it('mints an internal id above existing rows for a new identity', async () => {
      await store.upsertOnLogin({ ...alice, id: 12345 }, 'owner')
      const { id, role } = await store.upsertOAuthLogin(carol, 'viewer')
      expect(id).toBeGreaterThan(12345)
      expect(role).toBe('viewer')
      const row = db.select().from(users).where(eq(users.id, id)).get()!
      expect(row.provider).toBe('google')
      expect(row.providerId).toBe(SUB)
    })

    it('finds the account back by (provider, providerId) and keeps the stored role', async () => {
      const first = await store.upsertOAuthLogin(carol, 'editor')
      await store.setRole(first.id, 'viewer')
      const again = await store.upsertOAuthLogin({ ...carol, name: 'C.' }, 'owner')
      // Same internal id, revoked role NOT restored by a stale bootstrap map.
      expect(again).toEqual({ id: first.id, role: 'viewer' })
      expect(db.select().from(users).where(eq(users.id, first.id)).get()!.name).toBe('C.')
    })

    it('keeps github and google identities with the same numeric tail distinct', async () => {
      const a = await store.upsertOAuthLogin({ provider: 'github', providerId: '42', login: 'gh-42' }, 'viewer')
      const b = await store.upsertOAuthLogin({ provider: 'google', providerId: '42', login: 'g42@example.com' }, 'viewer')
      expect(a.id).not.toBe(b.id)
    })
  })

  describe('invite', () => {
    it('pre-provisions a viewer stub, normalized and flagged invited', async () => {
      const account = await store.invite({ provider: 'google', handle: '  Dave@Example.COM ' })
      expect(account).toMatchObject({ login: 'dave@example.com', role: 'viewer', invited: true })
    })

    it('is idempotent and never resets an existing account', async () => {
      const first = await store.invite({ provider: 'google', handle: 'dave@example.com' })
      await store.setRole(first.id, 'editor')
      const again = await store.invite({ provider: 'google', handle: 'dave@example.com' })
      expect(again).toMatchObject({ id: first.id, role: 'editor' })
    })

    it('claim at first verified login: same id, kept role, real sub installed', async () => {
      const stub = await store.invite({ provider: 'google', handle: 'dave@example.com' })
      const identity = { provider: 'google' as const, providerId: '999999999999999999999', login: 'dave@example.com', name: 'Dave' }
      const claimed = await store.upsertOAuthLogin(identity, 'viewer', { claimInvited: true })
      // Grants attached to the invited account apply: it IS the same account.
      expect(claimed.id).toBe(stub.id)
      const relogin = await store.upsertOAuthLogin(identity, 'viewer')
      expect(relogin.id).toBe(stub.id)
      expect(db.select().from(users).where(eq(users.id, stub.id)).get()!.providerId).toBe(identity.providerId)
    })

    it('gmail spellings of one inbox are one account: dedupe and claim', async () => {
      // Gmail ignores dots and +suffixes; googlemail.com aliases gmail.com.
      const stub = await store.invite({ provider: 'google', handle: 'marie.durand.brand@gmail.com' })
      const again = await store.invite({ provider: 'google', handle: 'camillemartin.brand+test@googlemail.com' })
      expect(again.id).toBe(stub.id)
      // Google reports a canonical spelling that differs from the invited one.
      const claimed = await store.upsertOAuthLogin(
        { provider: 'google', providerId: '31415926535897932384', login: 'camillemartin.brand@gmail.com' },
        'viewer',
        { claimInvited: true },
      )
      expect(claimed.id).toBe(stub.id)
      // The stored login becomes the canonical spelling.
      expect(db.select().from(users).where(eq(users.id, stub.id)).get()!.login).toBe('camillemartin.brand@gmail.com')
    })

    it('keeps dots significant outside gmail', async () => {
      const a = await store.invite({ provider: 'google', handle: 'a.b@example.com' })
      const b = await store.invite({ provider: 'google', handle: 'ab@example.com' })
      expect(a.id).not.toBe(b.id)
    })

    it('inviting a spelling of an already-claimed inbox returns the real account', async () => {
      const real = await store.upsertOAuthLogin(
        { provider: 'google', providerId: '271828182845904523536', login: 'mariedurand2@gmail.com' },
        'viewer',
      )
      const invited = await store.invite({ provider: 'google', handle: 'marie.durand2@gmail.com' })
      expect(invited).toMatchObject({ id: real.id, invited: false })
    })

    it('an unverified email cannot inherit the invitation (fail closed)', async () => {
      await store.invite({ provider: 'google', handle: 'dave@example.com' })
      // Without claimInvited the insert path collides on the unique login:
      // the login fails rather than silently minting a second account.
      await expect(store.upsertOAuthLogin(
        { provider: 'google', providerId: '111', login: 'dave@example.com' },
        'viewer',
      )).rejects.toThrow()
    })

    it('a github username invitation is claimed case-insensitively', async () => {
      const stub = await store.invite({ provider: 'github', handle: 'shallowred' })
      expect(stub).toMatchObject({ login: 'shallowred', invited: true })
      // GitHub reports the canonical casing at login; usernames match either way.
      const claimed = await store.upsertOAuthLogin(
        { provider: 'github', providerId: '4242', login: 'ShallowRed' },
        'viewer',
        { claimInvited: true },
      )
      expect(claimed.id).toBe(stub.id)
      expect(db.select().from(users).where(eq(users.id, stub.id)).get()!.login).toBe('ShallowRed')
    })

    it('github and google invitations for lookalike handles stay distinct', async () => {
      const gh = await store.invite({ provider: 'github', handle: 'dave' })
      const gg = await store.invite({ provider: 'google', handle: 'dave@gmail.com' })
      expect(gh.id).not.toBe(gg.id)
    })
  })
})
