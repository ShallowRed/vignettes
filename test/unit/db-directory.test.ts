import { beforeEach, describe, expect, it } from 'vitest'
import { createDeckMeta } from '../../server/db/deck-meta'
import { createDbDirectory } from '../../server/db/directory'
import { deckAliases, decks, projects } from '../../server/db/schema'
import { freshDb } from './helpers/db'

describe('db directory', () => {
  let db: ReturnType<typeof freshDb>
  let directory: ReturnType<typeof createDbDirectory>
  const now = new Date(1700000000000)

  beforeEach(() => {
    db = freshDb()
    directory = createDbDirectory(db)
  })

  it('resolves a deck by canonical alias, slug and historical alias', async () => {
    db.insert(decks).values({
      slug: 'pipeline-recrutement',
      alias: 'ecran-pipeline',
      title: 'Pipeline',
      lifecycle: 'frozen',
      frozenBundle: 'ecran-pipeline',
      createdAt: now,
      updatedAt: now,
    }).run()
    db.insert(deckAliases).values({ alias: 'codimd/abc123', deckSlug: 'pipeline-recrutement' }).run()

    for (const key of ['ecran-pipeline', 'pipeline-recrutement', 'codimd/abc123']) {
      const entry = await directory.decks.resolveAlias(key)
      expect(entry).toMatchObject({
        alias: 'ecran-pipeline',
        slug: 'pipeline-recrutement',
        lifecycle: 'frozen',
        frozenBundle: 'ecran-pipeline',
        aliases: ['codimd/abc123'],
      })
    }
  })

  it('keeps alias-less decks out of the directory', async () => {
    db.insert(decks).values({ slug: 'draft-only', title: 'D', createdAt: now, updatedAt: now }).run()
    expect(await directory.decks.resolveAlias('draft-only')).toBeNull()
    expect(await directory.decks.list()).toEqual([])
  })

  it('lists projects ordered, resolving one by slug', async () => {
    db.insert(projects).values([
      { slug: 'zeta', title: 'Zeta', order: 2, createdAt: now, updatedAt: now },
      { slug: 'alpha', title: 'Alpha', order: 1, color: '#2563eb', createdAt: now, updatedAt: now },
    ]).run()
    expect((await directory.projects.list()).map(p => p.slug)).toEqual(['alpha', 'zeta'])
    expect(await directory.projects.resolve('alpha')).toMatchObject({ title: 'Alpha', color: '#2563eb' })
    expect(await directory.projects.resolve('ghost')).toBeNull()
  })
})

describe('deck meta', () => {
  let db: ReturnType<typeof freshDb>
  const now = new Date(1700000000000)

  beforeEach(() => {
    db = freshDb()
  })

  it('lists only managed rows, so draft anchors never shadow file stubs', async () => {
    db.insert(decks).values([
      { slug: 'anchor', title: 'anchor', createdAt: now, updatedAt: now },
      { slug: 'curated', title: 'Curated', status: 'public', managed: true, createdAt: now, updatedAt: now },
    ]).run()
    const meta = createDeckMeta(db)
    expect((await meta.listManaged()).map(d => d.slug)).toEqual(['curated'])
    expect(await meta.get('anchor')).toMatchObject({ managed: false, status: 'private' })
  })

  it('fails closed on an invalid stored status', async () => {
    db.insert(decks).values({ slug: 'd', title: 'D', status: 'everyone', managed: true, createdAt: now, updatedAt: now }).run()
    expect((await createDeckMeta(db).get('d'))!.status).toBe('private')
  })
})
