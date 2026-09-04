import { beforeEach, describe, expect, it } from 'vitest'
import { createDbDirectory } from '../../server/db/directory'
import { deckAliases, projects } from '../../server/db/schema'
import { freshDb, NOW, seedDeck } from './helpers/db'

describe('db directory', () => {
  let db: ReturnType<typeof freshDb>
  let directory: ReturnType<typeof createDbDirectory>

  beforeEach(() => {
    db = freshDb()
    directory = createDbDirectory(db)
  })

  it('resolves a deck by canonical alias, slug and historical alias', async () => {
    seedDeck(db, 'pipeline-recrutement', { alias: 'ecran-pipeline', lifecycle: 'frozen', frozenBundle: 'ecran-pipeline' })
    db.insert(deckAliases).values({ alias: 'codimd/abc123', deckSlug: 'pipeline-recrutement' }).run()

    for (const key of ['ecran-pipeline', 'pipeline-recrutement', 'codimd/abc123']) {
      expect(await directory.decks.resolveAlias(key)).toMatchObject({
        alias: 'ecran-pipeline',
        slug: 'pipeline-recrutement',
        lifecycle: 'frozen',
        frozenBundle: 'ecran-pipeline',
        aliases: ['codimd/abc123'],
      })
    }
  })

  it('keeps alias-less decks out of the directory', async () => {
    seedDeck(db, 'draft-only')
    expect(await directory.decks.resolveAlias('draft-only')).toBeNull()
    expect(await directory.decks.list()).toEqual([])
  })

  it('lists projects ordered, resolving one by slug', async () => {
    db.insert(projects).values([
      { slug: 'zeta', title: 'Zeta', order: 2, createdAt: NOW, updatedAt: NOW },
      { slug: 'alpha', title: 'Alpha', order: 1, color: '#2563eb', createdAt: NOW, updatedAt: NOW },
    ]).run()
    expect((await directory.projects.list()).map(p => p.slug)).toEqual(['alpha', 'zeta'])
    expect(await directory.projects.resolve('alpha')).toMatchObject({ title: 'Alpha', color: '#2563eb' })
    expect(await directory.projects.resolve('ghost')).toBeNull()
  })
})
