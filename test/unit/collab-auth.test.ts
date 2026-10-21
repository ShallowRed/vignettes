import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDeckMeta, usePermissionStore } from '../../layers/studio/server/utils/sources'
import { seedAccount, setupServerDb, stubH3Globals } from './helpers/server-db'

// The room is authorized at the WebSocket upgrade, from the session cookie. The
// route resolves the actor through getActorFromRequest, swapped so each test
// names who is knocking; grants and trash run against the real schema.
stubH3Globals()
setupServerDb()

const actor: { current: any } = { current: { role: 'anonymous' } }
vi.mock('../../layers/studio/server/utils/actor', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getActorFromRequest: async () => actor.current,
}))

const { default: collab } = await import('../../layers/studio/server/routes/collab')
function knock(deck: string, origin: string | null = 'http://localhost') {
  return collab.upgrade!(new Request(`http://localhost/collab?deck=${deck}`, { headers: origin ? { origin } : {} }) as any)
}

beforeEach(async () => {
  await useDeckMeta().update('deck', { title: 'Deck' })
  await seedAccount(2, 'collab', 'viewer')
  actor.current = { id: 2, login: 'collab', role: 'viewer' }
})

describe('collab room upgrade', () => {
  it('admits a collaborator holding an editor grant on the deck', async () => {
    await usePermissionStore().set('deck', 2, 'editor', 'boss')
    await expect(knock('deck')).resolves.toBeUndefined()
  })

  it('refuses a read-only grant (401)', async () => {
    await usePermissionStore().set('deck', 2, 'viewer', 'boss')
    await expect(knock('deck')).rejects.toMatchObject({ status: 401 })
  })

  it('refuses an anonymous socket (401)', async () => {
    actor.current = { role: 'anonymous' }
    await expect(knock('deck')).rejects.toMatchObject({ status: 401 })
  })

  it('refuses a trashed deck even to a global editor (404)', async () => {
    actor.current = { id: 2, login: 'collab', role: 'editor' }
    await useDeckMeta().softDelete('deck')
    await expect(knock('deck')).rejects.toMatchObject({ status: 404 })
  })

  it('refuses a socket opened by a page of another origin (403)', async () => {
    await usePermissionStore().set('deck', 2, 'editor', 'boss')
    await expect(knock('deck', 'https://other.example')).rejects.toMatchObject({ status: 403 })
    await expect(knock('deck', null)).rejects.toMatchObject({ status: 403 })
  })

  it('refuses a malformed deck parameter (400)', async () => {
    await expect(knock('not%20a%20slug')).rejects.toMatchObject({ status: 400 })
  })
})
