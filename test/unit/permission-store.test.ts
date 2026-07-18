import { beforeEach, describe, expect, it } from 'vitest'
import { createPermissionStore } from '../../server/db/permission-store'
import { users } from '../../server/db/schema'
import { freshDb } from './helpers/db'

describe('permission store', () => {
  let db: ReturnType<typeof freshDb>
  let store: ReturnType<typeof createPermissionStore>
  const now = new Date(1700000000000)

  beforeEach(() => {
    db = freshDb()
    store = createPermissionStore(db)
    db.insert(users).values([
      { id: 1, login: 'alice', createdAt: now, lastLoginAt: now },
      { id: 2, login: 'bob', createdAt: now, lastLoginAt: now },
    ]).run()
  })

  it('grants on a file-only deck by anchoring its row first', async () => {
    await store.set('not-in-db-yet', 1, 'editor', 'lucas')
    await expect(store.get('not-in-db-yet', 1)).resolves.toBe('editor')
  })

  it('scopes grants to the deck and user pair', async () => {
    await store.set('deck-a', 1, 'editor', 'lucas')
    await store.set('deck-a', 2, 'viewer', 'lucas')
    await store.set('deck-b', 1, 'viewer', 'lucas')

    await expect(store.get('deck-a', 2)).resolves.toBe('viewer')
    await store.remove('deck-a', 1)
    await expect(store.get('deck-a', 1)).resolves.toBeNull()
    // Removing one pair leaves the deck's other grant and the user's other deck.
    await expect(store.get('deck-a', 2)).resolves.toBe('viewer')
    await expect(store.get('deck-b', 1)).resolves.toBe('viewer')
  })

  it('upserts a re-grant instead of duplicating', async () => {
    await store.set('deck-a', 1, 'viewer', 'lucas')
    await store.set('deck-a', 1, 'editor', 'lucas')
    await expect(store.get('deck-a', 1)).resolves.toBe('editor')
    await expect(store.listForDeck('deck-a')).resolves.toHaveLength(1)
  })

  it('lists a deck grants with logins and a user grants by slug', async () => {
    await store.set('deck-a', 1, 'editor', 'lucas')
    await store.set('deck-b', 1, 'viewer', 'lucas')
    const forDeck = await store.listForDeck('deck-a')
    expect(forDeck[0]).toMatchObject({ userId: 1, login: 'alice', role: 'editor', grantedBy: 'lucas' })
    const forUser = await store.listForUser(1)
    expect(forUser.get('deck-a')).toBe('editor')
    expect(forUser.get('deck-b')).toBe('viewer')
  })
})
