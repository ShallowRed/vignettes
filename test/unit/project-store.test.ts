import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDeckMeta } from '../../layers/studio/server/db/deck-meta'
import { createDbDirectory } from '../../layers/studio/server/db/directory'
import { createProjectStore } from '../../layers/studio/server/db/project-store'
import { decks, projectPermissions, projects } from '../../layers/studio/server/db/schema'
import { freshDb, NOW, seedUser } from './helpers/db'

describe('project store — lifecycle + trash', () => {
  let db: ReturnType<typeof freshDb>
  let store: ReturnType<typeof createProjectStore>
  let meta: ReturnType<typeof createDeckMeta>
  let directory: ReturnType<typeof createDbDirectory>
  beforeEach(() => {
    db = freshDb()
    store = createProjectStore(db)
    meta = createDeckMeta(db)
    directory = createDbDirectory(db)
  })

  function addDeck(slug: string, project?: string) {
    db.insert(decks).values({ slug, alias: slug, title: slug, managed: true, project: project ?? null, createdAt: NOW, updatedAt: NOW }).run()
  }

  it('create derives a unique slug from the title', async () => {
    const a = await store.create({ title: 'Mon Dossier' })
    const b = await store.create({ title: 'Mon Dossier' })
    expect(a.slug).toBe('mon-dossier')
    expect(b.slug).toBe('mon-dossier-2')
  })

  it('rename cascades the slug to decks and grants', async () => {
    const p = await store.create({ title: 'Client' })
    addDeck('deck-a', p.slug)
    seedUser(db, 7, 'ana')
    db.insert(projectPermissions).values({ projectSlug: p.slug, userId: 7, role: 'viewer', grantedBy: 'ana', createdAt: NOW }).run()

    expect(await store.slugExists(p.slug)).toBe(true)
    const renamed = await store.rename(p.slug, 'client-final')
    expect(renamed?.slug).toBe('client-final')

    expect(db.select().from(projects).where(eq(projects.slug, p.slug)).get()).toBeUndefined()
    expect(db.select().from(decks).where(eq(decks.slug, 'deck-a')).get()?.project).toBe('client-final')
    expect(db.select().from(projectPermissions).where(eq(projectPermissions.projectSlug, 'client-final')).all()).toHaveLength(1)
    expect(db.select().from(projectPermissions).where(eq(projectPermissions.projectSlug, p.slug)).all()).toHaveLength(0)
  })

  it('soft-deleting a project cascades to its live decks and hides them', async () => {
    const p = await store.create({ title: 'Client' })
    addDeck('deck-a', p.slug)
    addDeck('deck-b', p.slug)
    addDeck('other', 'ailleurs')

    expect(await store.softDelete(p.slug)).toBe(true)

    // Project and its decks vanish from every read path.
    expect((await directory.projects.list()).map(x => x.slug)).not.toContain(p.slug)
    expect(await directory.projects.resolve(p.slug)).toBeNull()
    const listed = (await meta.listManaged()).map(d => d.slug)
    expect(listed).not.toContain('deck-a')
    expect(listed).not.toContain('deck-b')
    expect(listed).toContain('other') // a deck in another project is untouched
    expect(await directory.decks.resolveAlias('deck-a')).toBeNull()

    // They surface in the trash instead.
    expect((await store.listTrashed()).find(t => t.slug === p.slug)?.deckCount).toBe(2)
    expect((await meta.listTrashed()).map(d => d.slug).sort()).toEqual(['deck-a', 'deck-b'])
  })

  it('restoring a project brings back the folder and all its decks', async () => {
    const p = await store.create({ title: 'Client' })
    addDeck('deck-a', p.slug)
    await store.softDelete(p.slug)

    expect(await store.restore(p.slug)).toBe(true)
    expect((await directory.projects.list()).map(x => x.slug)).toContain(p.slug)
    expect((await meta.listManaged()).map(d => d.slug)).toContain('deck-a')
    expect(await store.listTrashed()).toEqual([])
  })

  it('purging a project permanently removes it and its decks', async () => {
    const p = await store.create({ title: 'Client' })
    addDeck('deck-a', p.slug)
    await store.softDelete(p.slug)

    expect(await store.purge(p.slug)).toBe(true)
    expect(db.select().from(projects).where(eq(projects.slug, p.slug)).get()).toBeUndefined()
    expect(db.select().from(decks).where(eq(decks.slug, 'deck-a')).get()).toBeUndefined()
  })
})
