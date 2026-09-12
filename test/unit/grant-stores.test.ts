import type { DeckGrant } from '../../layers/studio/shared/access'
import { beforeEach, describe, expect, it } from 'vitest'
import { createPermissionStore } from '../../layers/studio/server/db/permission-store'
import { createProjectPermissionStore } from '../../layers/studio/server/db/project-permission-store'
import { freshDb, seedUser } from './helpers/db'

// Deck grants and folder master keys are two tables with one contract: the same
// resolution, listing, expiry and upsert rules. One suite runs against both.
interface GrantStore {
  get: (scope: string, userId: number) => Promise<DeckGrant | null>
  set: (scope: string, userId: number, role: DeckGrant, grantedBy: string, expiresAt?: Date | null) => Promise<void>
  remove: (scope: string, userId: number) => Promise<void>
  listForUser: (userId: number) => Promise<Map<string, DeckGrant>>
  listForScope: (scope: string) => Promise<{ userId: number, login: string, role: DeckGrant, grantedBy: string, expiresAt: Date | null }[]>
}

const STORES: { name: string, make: (db: ReturnType<typeof freshDb>) => GrantStore }[] = [
  { name: 'deck grants', make: (db) => {
    const s = createPermissionStore(db)
    return { ...s, listForScope: s.listForDeck }
  } },
  { name: 'folder master keys', make: (db) => {
    const s = createProjectPermissionStore(db)
    return { ...s, listForScope: s.listForProject }
  } },
]

describe.each(STORES)('$name', ({ make }) => {
  let store: GrantStore

  beforeEach(() => {
    const db = freshDb()
    store = make(db)
    seedUser(db, 1, 'alice')
    seedUser(db, 2, 'bob')
  })

  it('grants on a scope with no row yet by anchoring it first', async () => {
    await store.set('not-in-db-yet', 1, 'editor', 'lucas')
    await expect(store.get('not-in-db-yet', 1)).resolves.toBe('editor')
  })

  it('an expired grant no longer resolves but stays listed for the owner', async () => {
    await store.set('a', 1, 'editor', 'lucas', new Date(Date.now() - 1000))
    await expect(store.get('a', 1)).resolves.toBeNull()
    expect((await store.listForUser(1)).size).toBe(0)
    const listed = await store.listForScope('a')
    expect(listed).toHaveLength(1)
    expect(listed[0]!.expiresAt!.getTime()).toBeLessThan(Date.now())
  })

  it('a future expiry resolves until its date', async () => {
    await store.set('a', 1, 'viewer', 'lucas', new Date(Date.now() + 86_400_000))
    await expect(store.get('a', 1)).resolves.toBe('viewer')
    expect((await store.listForUser(1)).get('a')).toBe('viewer')
  })

  it('scopes grants to the (scope, user) pair', async () => {
    await store.set('a', 1, 'editor', 'lucas')
    await store.set('a', 2, 'viewer', 'lucas')
    await store.set('b', 1, 'viewer', 'lucas')
    await store.remove('a', 1)
    await expect(store.get('a', 1)).resolves.toBeNull()
    // Removing one pair leaves the scope's other grant and the user's other scope.
    await expect(store.get('a', 2)).resolves.toBe('viewer')
    await expect(store.get('b', 1)).resolves.toBe('viewer')
  })

  it('upserts a re-grant instead of duplicating', async () => {
    await store.set('a', 1, 'viewer', 'lucas')
    await store.set('a', 1, 'editor', 'lucas')
    await expect(store.get('a', 1)).resolves.toBe('editor')
    await expect(store.listForScope('a')).resolves.toHaveLength(1)
  })

  it('lists a scope with logins, and a user by scope', async () => {
    await store.set('a', 1, 'editor', 'lucas')
    await store.set('b', 1, 'viewer', 'lucas')
    expect((await store.listForScope('a'))[0]).toMatchObject({ userId: 1, login: 'alice', role: 'editor', grantedBy: 'lucas' })
    const forUser = await store.listForUser(1)
    expect(forUser.get('a')).toBe('editor')
    expect(forUser.get('b')).toBe('viewer')
  })
})
