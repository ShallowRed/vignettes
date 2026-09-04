import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { decks } from '../../server/db/schema'
import { listVisiblePresentations, listVisibleProjects } from '../../server/utils/catalog'
import { useDb } from '../../server/utils/db'
import { useDeckMeta, usePermissionStore, useProjectPermissionStore } from '../../server/utils/sources'
import { anon, asUser, seedAccount, setupServerDb, stubH3Globals } from './helpers/server-db'

// The catalog reports capability, not role: an `editor` grant is what the server
// accepts for editing, so the payload must say so (the card's pencil follows it).
stubH3Globals()
setupServerDb()

const collab = () => asUser(10, 'collab')

beforeEach(async () => {
  // A published private deck plus an unpublished one, both in the same folder.
  await useDeckMeta().update('published-deck', { title: 'Publié', status: 'private', project: 'client' })
  await useDeckMeta().update('draft-deck', { title: 'Brouillon', status: 'private', project: 'client' })
  useDb().update(decks).set({ publishedVersionId: 1 }).where(eq(decks.slug, 'published-deck')).run()
  await seedAccount(10, 'collab', 'viewer')
})

describe('listVisiblePresentations', () => {
  it('reports canEdit for an editor grant on the deck', async () => {
    await usePermissionStore().set('published-deck', 10, 'editor', 'boss')
    const listed = await listVisiblePresentations(collab())
    expect(listed.find(d => d.slug === 'published-deck')?.canEdit).toBe(true)
  })

  it('a folder editor grant opens every deck in it, unpublished ones included', async () => {
    await useProjectPermissionStore().set('client', 10, 'editor', 'boss')
    const listed = await listVisiblePresentations(collab())
    expect(listed.find(d => d.slug === 'published-deck')?.canEdit).toBe(true)
    expect(listed.map(d => d.slug)).toContain('draft-deck')
  })

  it('a read-only grant sees published decks only, with no edit affordance', async () => {
    await useProjectPermissionStore().set('client', 10, 'viewer', 'boss')
    const listed = await listVisiblePresentations(collab())
    expect(listed.map(d => d.slug)).toEqual(['published-deck'])
    expect(listed[0]!.canEdit).toBeUndefined()
  })

  it('says nothing about editing to an anonymous visitor', async () => {
    const listed = await listVisiblePresentations(anon())
    expect(listed.every(d => d.canEdit === undefined)).toBe(true)
  })
})

describe('listVisibleProjects', () => {
  it('exposes the actor\'s own folder grant so the UI can key create on it', async () => {
    await useProjectPermissionStore().set('client', 10, 'editor', 'boss')
    const folders = await listVisibleProjects(collab())
    expect(folders.find(p => p.slug === 'client')?.myGrant).toBe('editor')
  })
})
