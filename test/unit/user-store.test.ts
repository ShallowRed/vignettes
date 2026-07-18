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
})
