import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { deckAliases, deckPermissions, decks, deckVersions, users } from '../../layers/studio/server/db/schema'
import { freshDb, NOW, seedDeck, seedUser } from './helpers/db'

// Constraints the migrations must define: the stores rely on them rather than
// re-checking in code.
describe('db schema', () => {
  let db: ReturnType<typeof freshDb>

  beforeEach(() => {
    db = freshDb()
  })

  it('defaults fail closed: a deck is private, live, listed and unpublished; a user is a viewer', () => {
    seedDeck(db, 'd')
    seedUser(db, 1, 'alice')
    expect(db.select().from(decks).where(eq(decks.slug, 'd')).get()).toMatchObject({
      status: 'private',
      lifecycle: 'live',
      unlisted: false,
      publishedVersionId: null,
    })
    expect(db.select().from(users).where(eq(users.id, 1)).get()!.role).toBe('viewer')
  })

  it('rejects a version or a historical alias for an unknown deck (fk)', () => {
    expect(() =>
      db.insert(deckVersions).values({ deckSlug: 'ghost', raw: 'x', publishedBy: 'x', publishedAt: NOW }).run(),
    ).toThrow(/FOREIGN KEY/i)
    expect(() =>
      db.insert(deckAliases).values({ alias: 'x', deckSlug: 'ghost' }).run(),
    ).toThrow(/FOREIGN KEY/i)
  })

  it('enforces unique logins', () => {
    seedUser(db, 1, 'alice')
    expect(() => seedUser(db, 2, 'alice')).toThrow(/UNIQUE/i)
  })

  it('allows one grant per deck and user (composite pk)', () => {
    seedDeck(db, 'd')
    seedUser(db, 1, 'alice')
    db.insert(deckPermissions).values({ deckSlug: 'd', userId: 1, role: 'viewer', grantedBy: 'lucas', createdAt: NOW }).run()
    expect(() =>
      db.insert(deckPermissions).values({ deckSlug: 'd', userId: 1, role: 'editor', grantedBy: 'lucas', createdAt: NOW }).run(),
    ).toThrow(/UNIQUE|PRIMARY/i)
  })
})
