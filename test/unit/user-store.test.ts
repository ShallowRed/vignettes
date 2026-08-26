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
})
