import { describe, expect, it } from 'vitest'
import { ADAPTERS, useAdapter } from './helpers/adapters'

describe.each(ADAPTERS)('user store ($name)', (adapter) => {
  const db = useAdapter(adapter)
  const store = () => db.stores.users
  const user = async (id: number) => (await db.rows.select('users', { id }))[0]!
  const alice = { id: 1, login: 'alice', name: 'Alice', avatarUrl: 'https://a.example/1' }

  it('seeds a new user with the bootstrap role', async () => {
    await expect(store().upsertOnLogin(alice, 'owner')).resolves.toBe('owner')
    await expect(store().getRole(1)).resolves.toBe('owner')
  })

  it('keeps the stored role on re-login (database is the truth)', async () => {
    await store().upsertOnLogin(alice, 'owner')
    await store().setRole(1, 'viewer')
    // A later login with a stale env map must not restore the revoked privilege.
    await expect(store().upsertOnLogin(alice, 'owner')).resolves.toBe('viewer')
  })

  it('refreshes the profile on login without touching the role', async () => {
    await store().upsertOnLogin(alice, 'editor')
    await store().upsertOnLogin({ ...alice, login: 'alice-renamed', name: 'A.' }, 'viewer')
    const listed = await store().list()
    expect(listed).toHaveLength(1)
    expect(listed[0]).toMatchObject({ login: 'alice-renamed', name: 'A.', role: 'editor' })
  })

  it('returns null for an unknown user', async () => {
    await expect(store().getRole(404)).resolves.toBeNull()
  })

  it('degrades an invalid stored role to viewer', async () => {
    await store().upsertOnLogin(alice, 'owner')
    await db.rows.update('users', { role: 'superadmin' }, { id: 1 })
    await expect(store().getRole(1)).resolves.toBe('viewer')
  })

  it('two id-keyed accounts coexist under the provider-identity index', async () => {
    // upsertOnLogin must mirror the 0010 backfill: without a per-row providerId
    // the second insert would collide on ('github', '').
    await store().upsertOnLogin({ id: 900_000_001, login: 'dev-owner' }, 'owner')
    await expect(store().upsertOnLogin({ id: 900_000_002, login: 'dev-editor' }, 'editor')).resolves.toBe('editor')
  })

  describe('upsertOAuthLogin', () => {
    // A realistic Google sub: 21 digits, past Number.MAX_SAFE_INTEGER — it must
    // round-trip as a string with no precision loss.
    const SUB = '104858372634859273645'
    const carol = { provider: 'google' as const, providerId: SUB, login: 'carol@example.com', name: 'Carol' }

    it('mints an internal id above existing rows for a new identity', async () => {
      await store().upsertOnLogin({ ...alice, id: 12345 }, 'owner')
      const { id, role } = await store().upsertOAuthLogin(carol, 'viewer')
      expect(id).toBeGreaterThan(12345)
      expect(role).toBe('viewer')
      const row = await user(id)
      expect(row.provider).toBe('google')
      expect(row.providerId).toBe(SUB)
    })

    it('finds the account back by (provider, providerId) and keeps the stored role', async () => {
      const first = await store().upsertOAuthLogin(carol, 'editor')
      await store().setRole(first.id, 'viewer')
      const again = await store().upsertOAuthLogin({ ...carol, name: 'C.' }, 'owner')
      // Same internal id, revoked role NOT restored by a stale bootstrap map.
      expect(again).toEqual({ id: first.id, role: 'viewer' })
      expect((await user(first.id)).name).toBe('C.')
    })

    it('makes the first account an owner when the caller allows it', async () => {
      await expect(store().upsertOAuthLogin(carol, 'viewer', { firstAccountOwns: true })).resolves.toMatchObject({ role: 'owner' })
    })

    it('gives the first account its bootstrap role otherwise', async () => {
      await expect(store().upsertOAuthLogin(carol, 'viewer')).resolves.toMatchObject({ role: 'viewer' })
    })

    it('gives the second account its bootstrap role', async () => {
      await store().upsertOAuthLogin(carol, 'viewer', { firstAccountOwns: true })
      const second = await store().upsertOAuthLogin({ provider: 'github', providerId: '7', login: 'dave' }, 'viewer', { firstAccountOwns: true })
      expect(second.role).toBe('viewer')
    })

    it('counts an invited account, so a guest signing in first stays a viewer', async () => {
      await store().invite({ provider: 'google', handle: 'dave@example.com' })
      await expect(store().upsertOAuthLogin(carol, 'viewer', { firstAccountOwns: true })).resolves.toMatchObject({ role: 'viewer' })
    })

    it('keeps github and google identities with the same numeric tail distinct', async () => {
      const a = await store().upsertOAuthLogin({ provider: 'github', providerId: '42', login: 'gh-42' }, 'viewer')
      const b = await store().upsertOAuthLogin({ provider: 'google', providerId: '42', login: 'g42@example.com' }, 'viewer')
      expect(a.id).not.toBe(b.id)
    })
  })

  describe('invite', () => {
    it('pre-provisions a viewer stub, normalized and flagged invited', async () => {
      const account = await store().invite({ provider: 'google', handle: '  Dave@Example.COM ' })
      expect(account).toMatchObject({ login: 'dave@example.com', role: 'viewer', invited: true })
    })

    it('is idempotent and never resets an existing account', async () => {
      const first = await store().invite({ provider: 'google', handle: 'dave@example.com' })
      await store().setRole(first.id, 'editor')
      const again = await store().invite({ provider: 'google', handle: 'dave@example.com' })
      expect(again).toMatchObject({ id: first.id, role: 'editor' })
    })

    it('claim at first verified login: same id, kept role, real sub installed', async () => {
      const stub = await store().invite({ provider: 'google', handle: 'dave@example.com' })
      const identity = { provider: 'google' as const, providerId: '999999999999999999999', login: 'dave@example.com', name: 'Dave' }
      const claimed = await store().upsertOAuthLogin(identity, 'viewer', { claimInvited: true })
      // Grants attached to the invited account apply: it IS the same account.
      expect(claimed.id).toBe(stub.id)
      const relogin = await store().upsertOAuthLogin(identity, 'viewer')
      expect(relogin.id).toBe(stub.id)
      expect((await user(stub.id)).providerId).toBe(identity.providerId)
    })

    it('gmail spellings of one inbox are one account: dedupe and claim', async () => {
      // Gmail ignores dots and +suffixes; googlemail.com aliases gmail.com.
      const stub = await store().invite({ provider: 'google', handle: 'marie.durand@gmail.com' })
      const again = await store().invite({ provider: 'google', handle: 'mariedurand+test@googlemail.com' })
      expect(again.id).toBe(stub.id)
      // Google reports a canonical spelling that differs from the invited one.
      const claimed = await store().upsertOAuthLogin(
        { provider: 'google', providerId: '31415926535897932384', login: 'mariedurand@gmail.com' },
        'viewer',
        { claimInvited: true },
      )
      expect(claimed.id).toBe(stub.id)
      // The stored login becomes the canonical spelling.
      expect((await user(stub.id)).login).toBe('mariedurand@gmail.com')
    })

    it('keeps dots significant outside gmail', async () => {
      const a = await store().invite({ provider: 'google', handle: 'a.b@example.com' })
      const b = await store().invite({ provider: 'google', handle: 'ab@example.com' })
      expect(a.id).not.toBe(b.id)
    })

    it('inviting a spelling of an already-claimed inbox returns the real account', async () => {
      const real = await store().upsertOAuthLogin(
        { provider: 'google', providerId: '271828182845904523536', login: 'mariedurand2@gmail.com' },
        'viewer',
      )
      const invited = await store().invite({ provider: 'google', handle: 'marie.durand2@gmail.com' })
      expect(invited).toMatchObject({ id: real.id, invited: false })
    })

    it('an unverified email cannot inherit the invitation (fail closed)', async () => {
      await store().invite({ provider: 'google', handle: 'dave@example.com' })
      // Without claimInvited the insert path collides on the unique login:
      // the login fails rather than silently minting a second account.
      await expect(store().upsertOAuthLogin(
        { provider: 'google', providerId: '111', login: 'dave@example.com' },
        'viewer',
      )).rejects.toThrow()
    })

    it('a github username invitation is claimed case-insensitively', async () => {
      const stub = await store().invite({ provider: 'github', handle: 'shallowred' })
      expect(stub).toMatchObject({ login: 'shallowred', invited: true })
      // GitHub reports the canonical casing at login; usernames match either way.
      const claimed = await store().upsertOAuthLogin(
        { provider: 'github', providerId: '4242', login: 'ShallowRed' },
        'viewer',
        { claimInvited: true },
      )
      expect(claimed.id).toBe(stub.id)
      expect((await user(stub.id)).login).toBe('ShallowRed')
    })

    it('github and google invitations for lookalike handles stay distinct', async () => {
      const gh = await store().invite({ provider: 'github', handle: 'dave' })
      const gg = await store().invite({ provider: 'google', handle: 'dave@gmail.com' })
      expect(gh.id).not.toBe(gg.id)
    })
  })

  describe('remove', () => {
    it('deletes the account with every grant it holds', async () => {
      const account = await store().invite({ provider: 'google', handle: 'gone@example.com' })
      await db.stores.deckGrants.set('deck', account.id, 'viewer', 'boss')
      await expect(store().remove(account.id)).resolves.toBe(true)
      await expect(store().getRole(account.id)).resolves.toBeNull()
      await expect(db.stores.deckGrants.get('deck', account.id)).resolves.toBeNull()
    })

    it('reports an unknown id', async () => {
      await expect(store().remove(404)).resolves.toBe(false)
    })
  })
})
