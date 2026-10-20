import type { GrantRecord, GrantStore, Stores } from '../../layers/studio/server/db/ports'
import { beforeEach, describe, expect, it } from 'vitest'
import { ADAPTERS, seedUser, useAdapter } from './helpers/adapters'

// Deck grants and folder master keys are two tables with one contract: the same
// resolution, listing, expiry and upsert rules. One suite runs against both.
interface ScopedGrants extends GrantStore {
  listForScope: (scope: string) => Promise<GrantRecord[]>
}

const STORES: { name: string, make: (stores: Stores) => ScopedGrants }[] = [
  { name: 'deck grants', make: ({ deckGrants: s }) => ({ ...s, listForScope: s.listForDeck }) },
  { name: 'folder master keys', make: ({ projectGrants: s }) => ({ ...s, listForScope: s.listForProject }) },
]

describe.each(ADAPTERS.flatMap(adapter => STORES.map(store => ({ ...store, adapter, label: adapter.name }))))('$name ($label)', ({ adapter, make }) => {
  const db = useAdapter(adapter)
  let store: ScopedGrants

  beforeEach(async () => {
    store = make(db.stores)
    await seedUser(db.rows, 1, 'alice')
    await seedUser(db.rows, 2, 'bob')
  })

  it('grants on a scope with no row yet by anchoring it first', async () => {
    await store.set('not-in-db-yet', 1, 'editor', 'lucas')
    await expect(store.get('not-in-db-yet', 1)).resolves.toBe('editor')
  })

  it('anchors nothing when the grant itself fails', async () => {
    // User 404 does not exist: the grant breaks its foreign key.
    await expect(store.set('never-anchored', 404, 'viewer', 'lucas')).rejects.toThrow()
    expect(await db.rows.select('decks', { slug: 'never-anchored' })).toEqual([])
    expect(await db.rows.select('projects', { slug: 'never-anchored' })).toEqual([])
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
