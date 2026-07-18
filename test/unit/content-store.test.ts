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

  it('refuses empty markdown (would publish a blank deck)', async () => {
    await expect(content.writer.save({ slug: 'd', raw: '' })).rejects.toThrow(/empty markdown/i)
  })
})
