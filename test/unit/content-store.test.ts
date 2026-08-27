import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDbContent } from '../../server/db/content-store'
import { decks, deckVersions } from '../../server/db/schema'
import { freshDb } from './helpers/db'

const DECK = `---
title: Mon deck
status: public
theme: minimal
project: interne
---

# Contenu
`

describe('createDbContent', () => {
  let db: ReturnType<typeof freshDb>
  let content: ReturnType<typeof createDbContent>

  beforeEach(() => {
    db = freshDb()
    content = createDbContent(db)
  })

  it('misses on an unpublished deck', async () => {
    expect(await content.source.load('nope')).toBeNull()
  })

  it('publishes then serves the exact markdown', async () => {
    await content.writer.save({ slug: 'my-deck', raw: DECK, actor: 'lucas' })
    expect((await content.source.load('my-deck'))?.raw).toBe(DECK)
  })

  it('derives the catalog and access axes from the frontmatter', async () => {
    await content.writer.save({ slug: 'my-deck', raw: DECK, actor: 'lucas' })
    const deck = db.select().from(decks).where(eq(decks.slug, 'my-deck')).get()!
    expect(deck.title).toBe('Mon deck')
    expect(deck.status).toBe('public')
    expect(deck.theme).toBe('minimal')
    expect(deck.project).toBe('interne')
    expect(deck.unlisted).toBe(false)
    expect(deck.managed).toBe(true)
  })

  it('defaults the status closed when the frontmatter has none', async () => {
    await content.writer.save({ slug: 'bare', raw: '# Sans frontmatter', actor: 'lucas' })
    expect(db.select().from(decks).where(eq(decks.slug, 'bare')).get()!.status).toBe('private')
  })

  it('keeps every published version immutable and serves the latest', async () => {
    await content.writer.save({ slug: 'd', raw: '# v1', actor: 'a' })
    await content.writer.save({ slug: 'd', raw: '# v2', actor: 'b' })
    expect((await content.source.load('d'))?.raw).toBe('# v2')
    const versions = db.select().from(deckVersions).where(eq(deckVersions.deckSlug, 'd')).all()
    expect(versions.map(v => v.raw)).toEqual(['# v1', '# v2'])
    expect(versions.map(v => v.publishedBy)).toEqual(['a', 'b'])
  })

  it('does not serve a soft-deleted deck', async () => {
    await content.writer.save({ slug: 'trashed', raw: '# hidden', actor: 'lucas' })
    db.update(decks).set({ deletedAt: new Date() }).where(eq(decks.slug, 'trashed')).run()
    expect(await content.source.load('trashed')).toBeNull()
  })

  it('refuses empty markdown (would publish a blank deck)', async () => {
    await expect(content.writer.save({ slug: 'd', raw: '' })).rejects.toThrow(/empty markdown/i)
  })

  it('republishing cannot reopen a deck an admin closed', async () => {
    // The incident shape: published public, admin flips to private in the DB
    // (managed row = access truth), then a republish carries a stale
    // `status: public` frontmatter. The DB status must survive.
    await content.writer.save({ slug: 'client', raw: DECK, actor: 'lucas' })
    db.update(decks).set({ status: 'private', managed: true }).where(eq(decks.slug, 'client')).run()
    await content.writer.save({ slug: 'client', raw: DECK, actor: 'lucas' })
    expect(db.select().from(decks).where(eq(decks.slug, 'client')).get()!.status).toBe('private')
  })

  it('the first publish still derives access axes from the frontmatter', async () => {
    // An unmanaged anchor row (draft-only deck) has no admin intent to protect.
    db.insert(decks).values({ slug: 'fresh', title: 'fresh', createdAt: new Date(), updatedAt: new Date() }).run()
    await content.writer.save({ slug: 'fresh', raw: DECK, actor: 'lucas' })
    expect(db.select().from(decks).where(eq(decks.slug, 'fresh')).get()!.status).toBe('public')
  })

  it('content axes keep following the frontmatter on republish', async () => {
    await content.writer.save({ slug: 'my-deck', raw: DECK, actor: 'lucas' })
    const renamed = DECK.replace('title: Mon deck', 'title: Renommé').replace('theme: minimal', 'theme: dsfr')
    await content.writer.save({ slug: 'my-deck', raw: renamed, actor: 'lucas' })
    const row = db.select().from(decks).where(eq(decks.slug, 'my-deck')).get()!
    expect(row.title).toBe('Renommé')
    expect(row.theme).toBe('dsfr')
  })

  it('a folder move or rename survives a republish with stale frontmatter', async () => {
    // The project decides which master keys apply: once managed, the DB value
    // wins over the source's stale `project:` (a folder rename cascades in DB
    // only — every deck's frontmatter would otherwise undo it at republish).
    await content.writer.save({ slug: 'my-deck', raw: DECK, actor: 'lucas' })
    db.update(decks).set({ project: 'renomme' }).where(eq(decks.slug, 'my-deck')).run()
    await content.writer.save({ slug: 'my-deck', raw: DECK, actor: 'lucas' })
    expect(db.select().from(decks).where(eq(decks.slug, 'my-deck')).get()!.project).toBe('renomme')
  })
})
