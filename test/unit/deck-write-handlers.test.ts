import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { deckDrafts, deckPermissions, decks, deckVersions, projectPermissions, projects, users } from '../../server/db/schema'
import { useDb } from '../../server/utils/db'
import { useProjectPermissionStore } from '../../server/utils/sources'
import { useUserStore } from '../../server/utils/users'
import { useMigratedTestDb } from './helpers/server-db'

// Drive the deck write handlers directly: the h3/Nitro auto-imports read from
// the event object each test builds, and the stores hit a migrated temp file.
vi.stubGlobal('defineEventHandler', (handler: any) => handler)
vi.stubGlobal('getUserSession', async (e: any) => e.session ?? null)
vi.stubGlobal('createError', (e: any) => Object.assign(new Error(e.statusMessage), e))
vi.stubGlobal('getRouterParam', (e: any, name: string) => e.params?.[name])
vi.stubGlobal('readBody', async (e: any) => e.body)
vi.stubGlobal('getQuery', (e: any) => e.query ?? {})
vi.stubGlobal('setResponseStatus', (e: any, code: number) => {
  e.status = code
})

const { default: saveDraft } = await import('../../server/api/presentations/[slug].put')
const { default: createDeck } = await import('../../server/api/presentations.post')

function asUser(id: number, login: string, over: Record<string, unknown> = {}) {
  return { session: { user: { id, login } }, ...over }
}

let cleanup: () => void

beforeAll(() => {
  cleanup = useMigratedTestDb()
})

beforeEach(async () => {
  const db = useDb()
  db.delete(deckPermissions).run()
  db.delete(projectPermissions).run()
  db.delete(deckVersions).run()
  db.delete(deckDrafts).run()
  db.delete(decks).run()
  db.delete(projects).run()
  db.delete(users).run()
  await useUserStore().upsertOnLogin({ id: 3, login: 'ed' }, 'editor')
  await useUserStore().upsertOnLogin({ id: 10, login: 'collab' }, 'viewer')
})

afterAll(() => cleanup())

const DECK = '---\ntitle: Deck\n---\n# v1\n'

describe('pUT /api/presentations/:slug (solo save)', () => {
  it('refuses a stale stamp instead of overwriting a newer draft', async () => {
    // First save: no draft existed, so the loaded stamp was null.
    const first = await saveDraft(asUser(3, 'ed', { params: { slug: 'deck' }, body: { raw: DECK, stamp: null } }) as any)
    expect(typeof first.stamp).toBe('number')
    // A second writer who loaded before that save carries the old (null) stamp.
    await expect(saveDraft(asUser(3, 'ed', { params: { slug: 'deck' }, body: { raw: '# theirs', stamp: null } }) as any))
      .rejects
      .toMatchObject({ statusCode: 409, data: { conflict: true } })
    // The current stamp goes through.
    await expect(saveDraft(asUser(3, 'ed', { params: { slug: 'deck' }, body: { raw: '# mine', stamp: first.stamp } }) as any))
      .resolves
      .toMatchObject({ ok: true })
  })

  it('keeps accepting a client that sends no stamp at all', async () => {
    await saveDraft(asUser(3, 'ed', { params: { slug: 'deck' }, body: { raw: DECK, stamp: null } }) as any)
    await expect(saveDraft(asUser(3, 'ed', { params: { slug: 'deck' }, body: { raw: '# legacy' } }) as any))
      .resolves
      .toMatchObject({ ok: true })
  })
})

describe('pOST /api/presentations (create)', () => {
  it('lets a collaborator create a deck inside a folder they can edit', async () => {
    await useProjectPermissionStore().set('client', 10, 'editor', 'boss')
    const event = asUser(10, 'collab', { body: { slug: 'new-deck', title: 'Nouveau', project: 'client' } })
    await expect(createDeck(event as any)).resolves.toMatchObject({ slug: 'new-deck', project: 'client' })
    expect((event as any).status).toBe(201)
  })

  it('refuses the same collaborator outside their folder (403)', async () => {
    await useProjectPermissionStore().set('client', 10, 'editor', 'boss')
    await expect(createDeck(asUser(10, 'collab', { body: { slug: 'new-deck', title: 'Nouveau', project: 'other' } }) as any))
      .rejects
      .toMatchObject({ statusCode: 403 })
    await expect(createDeck(asUser(10, 'collab', { body: { slug: 'new-deck', title: 'Nouveau' } }) as any))
      .rejects
      .toMatchObject({ statusCode: 403 })
  })

  it('refuses a read-only folder grant (403)', async () => {
    await useProjectPermissionStore().set('client', 10, 'viewer', 'boss')
    await expect(createDeck(asUser(10, 'collab', { body: { slug: 'new-deck', title: 'Nouveau', project: 'client' } }) as any))
      .rejects
      .toMatchObject({ statusCode: 403 })
  })
})
