import { describe, expect, it } from 'vitest'
import { ADAPTERS, useAdapter } from './helpers/adapters'

const DECK = `---
title: Mon deck
status: public
theme: minimal
project: interne
---

# Contenu
`

describe.each(ADAPTERS)('deck content ($name)', (adapter) => {
  const db = useAdapter(adapter)
  const content = () => db.stores.content
  const deck = async (slug: string) => (await db.rows.select('decks', { slug }))[0]!

  it('misses on an unpublished deck', async () => {
    expect(await content().source.load('nope')).toBeNull()
  })

  it('publishes then serves the exact markdown', async () => {
    await content().writer.save({ slug: 'my-deck', raw: DECK, actor: 'lucas' })
    expect((await content().source.load('my-deck'))?.raw).toBe(DECK)
  })

  it('derives the catalog and access axes from the frontmatter', async () => {
    await content().writer.save({ slug: 'my-deck', raw: DECK, actor: 'lucas' })
    const row = await deck('my-deck')
    expect(row.title).toBe('Mon deck')
    expect(row.status).toBe('public')
    expect(row.theme).toBe('minimal')
    expect(row.project).toBe('interne')
    expect(row.unlisted).toBe(false)
    expect(row.managed).toBe(true)
  })

  it('defaults the status closed when the frontmatter has none', async () => {
    await content().writer.save({ slug: 'bare', raw: '# Sans frontmatter', actor: 'lucas' })
    expect((await deck('bare')).status).toBe('private')
  })

  it('keeps every published version immutable and serves the latest', async () => {
    await content().writer.save({ slug: 'd', raw: '# v1', actor: 'a' })
    await content().writer.save({ slug: 'd', raw: '# v2', actor: 'b' })
    expect((await content().source.load('d'))?.raw).toBe('# v2')
    const versions = await db.rows.select('deckVersions', { deckSlug: 'd' })
    expect(versions.map(v => v.raw)).toEqual(['# v1', '# v2'])
    expect(versions.map(v => v.publishedBy)).toEqual(['a', 'b'])
  })

  it('does not serve a soft-deleted deck', async () => {
    await content().writer.save({ slug: 'trashed', raw: '# hidden', actor: 'lucas' })
    await db.rows.update('decks', { deletedAt: new Date() }, { slug: 'trashed' })
    expect(await content().source.load('trashed')).toBeNull()
  })

  it('republishing cannot reopen a deck an admin closed', async () => {
    // The incident shape: published public, admin flips to private in the DB
    // (managed row = access truth), then a republish carries a stale
    // `status: public` frontmatter. The DB status must survive.
    await content().writer.save({ slug: 'client', raw: DECK, actor: 'lucas' })
    await db.rows.update('decks', { status: 'private', managed: true }, { slug: 'client' })
    await content().writer.save({ slug: 'client', raw: DECK, actor: 'lucas' })
    expect((await deck('client')).status).toBe('private')
  })

  it('the first publish still derives access axes from the frontmatter', async () => {
    // An unmanaged anchor row (draft-only deck) has no admin intent to protect.
    await db.rows.insert('decks', { slug: 'fresh', title: 'fresh', createdAt: new Date(), updatedAt: new Date() })
    await content().writer.save({ slug: 'fresh', raw: DECK, actor: 'lucas' })
    expect((await deck('fresh')).status).toBe('public')
  })

  it('content axes keep following the frontmatter on republish', async () => {
    await content().writer.save({ slug: 'my-deck', raw: DECK, actor: 'lucas' })
    const renamed = DECK.replace('title: Mon deck', 'title: Renommé').replace('theme: minimal', 'theme: dsfr')
    await content().writer.save({ slug: 'my-deck', raw: renamed, actor: 'lucas' })
    const row = await deck('my-deck')
    expect(row.title).toBe('Renommé')
    expect(row.theme).toBe('dsfr')
  })

  it('a folder move or rename survives a republish with stale frontmatter', async () => {
    // The project decides which master keys apply: once managed, the DB value
    // wins over the source's stale `project:` (a folder rename cascades in DB
    // only — every deck's frontmatter would otherwise undo it at republish).
    await content().writer.save({ slug: 'my-deck', raw: DECK, actor: 'lucas' })
    await db.rows.update('decks', { project: 'renomme' }, { slug: 'my-deck' })
    await content().writer.save({ slug: 'my-deck', raw: DECK, actor: 'lucas' })
    expect((await deck('my-deck')).project).toBe('renomme')
  })
})
