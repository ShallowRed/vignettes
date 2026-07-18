import { Buffer } from 'node:buffer'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { deckDrafts, decks, deckVersions } from '../../server/db/schema'
import { freshDb } from './helpers/db'

describe('db schema', () => {
  let db: ReturnType<typeof freshDb>
  const now = new Date(1700000000000)

  beforeEach(() => {
    db = freshDb()
  })

  it('defaults a deck to private/live (fail closed)', () => {
    db.insert(decks).values({ slug: 'd', title: 'D', createdAt: now, updatedAt: now }).run()
    const row = db.select().from(decks).where(eq(decks.slug, 'd')).get()!
    expect(row.status).toBe('private')
    expect(row.lifecycle).toBe('live')
    expect(row.publishedVersionId).toBeNull()
  })

  it('publishes by inserting an immutable version and repointing', () => {
    db.insert(decks).values({ slug: 'd', title: 'D', createdAt: now, updatedAt: now }).run()
    const v1 = db.insert(deckVersions)
      .values({ deckSlug: 'd', raw: '# v1', publishedBy: 'lucas', publishedAt: now })
      .returning({ id: deckVersions.id })
      .get()!
    const v2 = db.insert(deckVersions)
      .values({ deckSlug: 'd', raw: '# v2', publishedBy: 'lucas', publishedAt: now })
      .returning({ id: deckVersions.id })
      .get()!

    db.update(decks).set({ publishedVersionId: v2.id }).where(eq(decks.slug, 'd')).run()
    const current = db.select().from(deckVersions).where(eq(deckVersions.id, db.select().from(decks).where(eq(decks.slug, 'd')).get()!.publishedVersionId!)).get()!
    expect(current.raw).toBe('# v2')

    // Rollback is just repointing at the previous immutable row.
    db.update(decks).set({ publishedVersionId: v1.id }).where(eq(decks.slug, 'd')).run()
    expect(db.select().from(deckVersions).where(eq(deckVersions.id, v1.id)).get()!.raw).toBe('# v1')
  })

  it('round-trips a draft Y.Doc binary', () => {
    db.insert(decks).values({ slug: 'd', title: 'D', createdAt: now, updatedAt: now }).run()
    const bytes = Buffer.from([1, 2, 3, 250, 255])
    db.insert(deckDrafts).values({ deckSlug: 'd', ydoc: bytes, updatedAt: now }).run()
    const row = db.select().from(deckDrafts).where(eq(deckDrafts.deckSlug, 'd')).get()!
    expect(Buffer.from(row.ydoc)).toEqual(bytes)
  })

  it('rejects a version for an unknown deck (fk)', () => {
    expect(() =>
      db.insert(deckVersions).values({ deckSlug: 'ghost', raw: 'x', publishedBy: 'x', publishedAt: now }).run(),
    ).toThrow(/FOREIGN KEY/i)
  })
})
