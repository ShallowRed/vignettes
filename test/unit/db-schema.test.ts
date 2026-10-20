import { beforeEach, describe, expect, it } from 'vitest'
import { freshSqlite, NOW, seedDeck, seedUser, sqliteRows } from './helpers/adapters'

// Constraints the migrations must define: the stores rely on them rather than
// re-checking in code.
describe('db schema', () => {
  let rows: ReturnType<typeof sqliteRows>

  beforeEach(() => {
    rows = sqliteRows(freshSqlite())
  })

  it('defaults fail closed: a deck is private, live, listed and unpublished; a user is a viewer', async () => {
    await seedDeck(rows, 'd')
    await seedUser(rows, 1, 'alice')
    expect((await rows.select('decks', { slug: 'd' }))[0]).toMatchObject({
      status: 'private',
      lifecycle: 'live',
      unlisted: false,
      publishedVersionId: null,
    })
    expect((await rows.select('users', { id: 1 }))[0]!.role).toBe('viewer')
  })

  it('rejects a version or a historical alias for an unknown deck (fk)', async () => {
    await expect(
      rows.insert('deckVersions', { deckSlug: 'ghost', raw: 'x', publishedBy: 'x', publishedAt: NOW }),
    ).rejects.toThrow(/FOREIGN KEY/i)
    await expect(
      rows.insert('deckAliases', { alias: 'x', deckSlug: 'ghost' }),
    ).rejects.toThrow(/FOREIGN KEY/i)
  })

  it('enforces unique logins', async () => {
    await seedUser(rows, 1, 'alice')
    await expect(seedUser(rows, 2, 'alice')).rejects.toThrow(/UNIQUE/i)
  })

  it('allows one grant per deck and user (composite pk)', async () => {
    await seedDeck(rows, 'd')
    await seedUser(rows, 1, 'alice')
    await rows.insert('deckPermissions', { deckSlug: 'd', userId: 1, role: 'viewer', grantedBy: 'lucas', createdAt: NOW })
    await expect(
      rows.insert('deckPermissions', { deckSlug: 'd', userId: 1, role: 'editor', grantedBy: 'lucas', createdAt: NOW }),
    ).rejects.toThrow(/UNIQUE|PRIMARY/i)
  })
})
