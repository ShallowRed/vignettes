import { describe, expect, it } from 'vitest'
import { ADAPTERS, NOW, seedDeck, useAdapter } from './helpers/adapters'

describe.each(ADAPTERS)('db directory ($name)', (adapter) => {
  const db = useAdapter(adapter)
  const decks = () => db.stores.deckDirectory
  const projects = () => db.stores.projectDirectory

  it('resolves a deck by canonical alias, slug and historical alias', async () => {
    await seedDeck(db.rows, 'pipeline-recrutement', { alias: 'ecran-pipeline', lifecycle: 'frozen', frozenBundle: 'ecran-pipeline' })
    await db.rows.insert('deckAliases', { alias: 'codimd/abc123', deckSlug: 'pipeline-recrutement' })

    for (const key of ['ecran-pipeline', 'pipeline-recrutement', 'codimd/abc123']) {
      expect(await decks().resolveAlias(key)).toMatchObject({
        alias: 'ecran-pipeline',
        slug: 'pipeline-recrutement',
        lifecycle: 'frozen',
        frozenBundle: 'ecran-pipeline',
        aliases: ['codimd/abc123'],
      })
    }
  })

  it('keeps alias-less decks out of the directory', async () => {
    await seedDeck(db.rows, 'draft-only')
    expect(await decks().resolveAlias('draft-only')).toBeNull()
    expect(await decks().list()).toEqual([])
  })

  it('lists projects ordered, resolving one by slug', async () => {
    await db.rows.insert('projects', [
      { slug: 'zeta', title: 'Zeta', order: 2, createdAt: NOW, updatedAt: NOW },
      { slug: 'alpha', title: 'Alpha', order: 1, color: '#2563eb', createdAt: NOW, updatedAt: NOW },
    ])
    expect((await projects().list()).map(p => p.slug)).toEqual(['alpha', 'zeta'])
    expect(await projects().resolve('alpha')).toMatchObject({ title: 'Alpha', color: '#2563eb' })
    expect(await projects().resolve('ghost')).toBeNull()
  })
})
