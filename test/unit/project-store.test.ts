import { describe, expect, it } from 'vitest'
import { ADAPTERS, NOW, seedUser, useAdapter } from './helpers/adapters'

describe.each(ADAPTERS)('project store, lifecycle and trash ($name)', (adapter) => {
  const db = useAdapter(adapter)
  const store = () => db.stores.projects
  const meta = () => db.stores.deckMeta
  const directory = () => ({ decks: db.stores.deckDirectory, projects: db.stores.projectDirectory })

  async function addDeck(slug: string, project?: string) {
    await db.rows.insert('decks', { slug, alias: slug, title: slug, managed: true, project: project ?? null, createdAt: NOW, updatedAt: NOW })
  }

  it('create derives a unique slug from the title', async () => {
    const a = await store().create({ title: 'Mon Dossier' })
    const b = await store().create({ title: 'Mon Dossier' })
    expect(a.slug).toBe('mon-dossier')
    expect(b.slug).toBe('mon-dossier-2')
  })

  it('create gives a folder titled « Divers » the next slug, the slug of the decks without a project being reserved', async () => {
    expect((await store().create({ title: 'Divers' })).slug).toBe('divers-2')
  })

  it('isLive accepts a live folder only', async () => {
    const project = await store().create({ title: 'Dossier' })
    expect(await store().isLive(project.slug)).toBe(true)
    expect(await store().isLive('mutualisation')).toBe(false)
    await store().softDelete(project.slug)
    expect(await store().isLive(project.slug)).toBe(false)
  })

  it('rename cascades the slug to decks and grants', async () => {
    const p = await store().create({ title: 'Client' })
    await addDeck('deck-a', p.slug)
    await seedUser(db.rows, 7, 'ana')
    await db.rows.insert('projectPermissions', { projectSlug: p.slug, userId: 7, role: 'viewer', grantedBy: 'ana', createdAt: NOW })

    expect(await store().slugExists(p.slug)).toBe(true)
    const renamed = await store().rename(p.slug, 'client-final')
    expect(renamed?.slug).toBe('client-final')

    expect(await db.rows.select('projects', { slug: p.slug })).toEqual([])
    expect((await db.rows.select('decks', { slug: 'deck-a' }))[0]?.project).toBe('client-final')
    expect(await db.rows.select('projectPermissions', { projectSlug: 'client-final' })).toHaveLength(1)
    expect(await db.rows.select('projectPermissions', { projectSlug: p.slug })).toHaveLength(0)
  })

  it('soft-deleting a project cascades to its live decks and hides them', async () => {
    const p = await store().create({ title: 'Client' })
    await addDeck('deck-a', p.slug)
    await addDeck('deck-b', p.slug)
    await addDeck('other', 'ailleurs')

    expect(await store().softDelete(p.slug)).toBe(true)

    // Project and its decks vanish from every read path.
    expect((await directory().projects.list()).map(x => x.slug)).not.toContain(p.slug)
    expect(await directory().projects.resolve(p.slug)).toBeNull()
    const listed = (await meta().listManaged()).map(d => d.slug)
    expect(listed).not.toContain('deck-a')
    expect(listed).not.toContain('deck-b')
    expect(listed).toContain('other') // a deck in another project is untouched
    expect(await directory().decks.resolveAlias('deck-a')).toBeNull()

    // They surface in the trash instead.
    expect((await store().listTrashed()).find(t => t.slug === p.slug)?.deckCount).toBe(2)
    expect((await meta().listTrashed()).map(d => d.slug).sort()).toEqual(['deck-a', 'deck-b'])
  })

  it('restoring a project brings back the folder and all its decks', async () => {
    const p = await store().create({ title: 'Client' })
    await addDeck('deck-a', p.slug)
    await store().softDelete(p.slug)

    expect(await store().restore(p.slug)).toBe(true)
    expect((await directory().projects.list()).map(x => x.slug)).toContain(p.slug)
    expect((await meta().listManaged()).map(d => d.slug)).toContain('deck-a')
    expect(await store().listTrashed()).toEqual([])
  })

  it('purging a project permanently removes it and its decks', async () => {
    const p = await store().create({ title: 'Client' })
    await addDeck('deck-a', p.slug)
    await store().softDelete(p.slug)

    expect(await store().purge(p.slug)).toBe(true)
    expect(await db.rows.select('projects', { slug: p.slug })).toEqual([])
    expect(await db.rows.select('decks', { slug: 'deck-a' })).toEqual([])
  })

  it('lists the decks filed in a project, the live ones apart', async () => {
    const p = await store().create({ title: 'Client' })
    await addDeck('deck-a', p.slug)
    await addDeck('deck-b', p.slug)
    await addDeck('other', 'ailleurs')
    await meta().softDelete('deck-b')
    expect(await store().liveDeckSlugs(p.slug)).toEqual(['deck-a'])
    expect((await store().deckSlugs(p.slug)).sort()).toEqual(['deck-a', 'deck-b'])
  })
})
