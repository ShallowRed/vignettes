import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { deckPermissions, decks, projectPermissions, projects, users } from '../../server/db/schema'
import { listVisiblePresentations } from '../../server/utils/catalog'
import { useDb } from '../../server/utils/db'
import { useDeckMeta, usePermissionStore, useProjectPermissionStore } from '../../server/utils/sources'
import { useUserStore } from '../../server/utils/users'
import { useMigratedTestDb } from './helpers/server-db'

// The catalog reports capability, not role: an `editor` grant is what the server
// accepts for editing, so the payload must say so — the card's pencil follows it.
vi.stubGlobal('getUserSession', async (e: any) => e.session ?? null)
vi.stubGlobal('createError', (e: any) => Object.assign(new Error(e.statusMessage), e))

const asUser = (id: number, login: string) => ({ session: { user: { id, login } } })
const anon = () => ({})

let cleanup: () => void

beforeAll(() => {
  cleanup = useMigratedTestDb()
})

beforeEach(async () => {
  const db = useDb()
  db.delete(deckPermissions).run()
  db.delete(projectPermissions).run()
  db.delete(decks).run()
  db.delete(projects).run()
  db.delete(users).run()
  // A published private deck plus an unpublished one, both in the same folder.
  await useDeckMeta().update('published-deck', { title: 'Publié', status: 'private', project: 'client' })
  await useDeckMeta().update('draft-deck', { title: 'Brouillon', status: 'private', project: 'client' })
  db.update(decks).set({ publishedVersionId: 1 }).where(eq(decks.slug, 'published-deck')).run()
  await useUserStore().upsertOnLogin({ id: 10, login: 'collab' }, 'viewer')
})

afterAll(() => cleanup())

describe('listVisiblePresentations', () => {
  it('reports canEdit for an editor grant on the deck', async () => {
    await usePermissionStore().set('published-deck', 10, 'editor', 'boss')
    const listed = await listVisiblePresentations(asUser(10, 'collab') as any)
    expect(listed.find(d => d.slug === 'published-deck')?.canEdit).toBe(true)
  })

  it('reports canEdit for an editor grant inherited from the folder', async () => {
    await useProjectPermissionStore().set('client', 10, 'editor', 'boss')
    const listed = await listVisiblePresentations(asUser(10, 'collab') as any)
    expect(listed.find(d => d.slug === 'published-deck')?.canEdit).toBe(true)
  })

  it('withholds canEdit from a read-only grant', async () => {
    await useProjectPermissionStore().set('client', 10, 'viewer', 'boss')
    const listed = await listVisiblePresentations(asUser(10, 'collab') as any)
    expect(listed.find(d => d.slug === 'published-deck')?.canEdit).toBeUndefined()
  })

  it('lists an unpublished deck to whoever may edit it, not just to global roles', async () => {
    await useProjectPermissionStore().set('client', 10, 'editor', 'boss')
    const slugs = (await listVisiblePresentations(asUser(10, 'collab') as any)).map(d => d.slug)
    expect(slugs).toContain('draft-deck')
  })

  it('hides an unpublished deck from a read-only grantee', async () => {
    await useProjectPermissionStore().set('client', 10, 'viewer', 'boss')
    const slugs = (await listVisiblePresentations(asUser(10, 'collab') as any)).map(d => d.slug)
    expect(slugs).not.toContain('draft-deck')
  })

  it('says nothing about editing to an anonymous visitor', async () => {
    const listed = await listVisiblePresentations(anon() as any)
    expect(listed.every(d => d.canEdit === undefined)).toBe(true)
  })
})
