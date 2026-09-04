import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { deckPermissions, decks, users } from '../../server/db/schema'
import { useDb } from '../../server/utils/db'
import { useDeckMeta, usePermissionStore } from '../../server/utils/sources'
import { useUserStore } from '../../server/utils/users'
import { useMigratedTestDb } from './helpers/server-db'

// The room is authorized at the WebSocket upgrade, from the session cookie. The
// route wraps its hooks in Nitro's defineWebSocketHandler (identity here) and
// resolves the actor through getActorFromRequest — swapped so each test names
// who is knocking. Everything else (grants, trash) runs against a real schema.
vi.stubGlobal('defineWebSocketHandler', (handler: any) => handler)
vi.stubGlobal('createError', (e: any) => Object.assign(new Error(e.statusMessage), e))

const actor: { current: any } = { current: { role: 'anonymous' } }
vi.mock('../../server/utils/actor', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getActorFromRequest: async () => actor.current,
}))

const { default: collab } = await import('../../server/routes/collab')
const knock = (deck: string) => collab.upgrade!(new Request(`http://localhost/collab?deck=${deck}`) as any)

let cleanup: () => void

beforeAll(() => {
  cleanup = useMigratedTestDb()
})

beforeEach(async () => {
  const db = useDb()
  db.delete(deckPermissions).run()
  db.delete(decks).run()
  db.delete(users).run()
  await useDeckMeta().update('deck', { title: 'Deck' })
  await useUserStore().upsertOnLogin({ id: 2, login: 'collab' }, 'viewer')
  actor.current = { id: 2, login: 'collab', role: 'viewer' }
})

afterAll(() => cleanup())

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

  it('refuses a malformed deck parameter (400)', async () => {
    await expect(knock('not%20a%20slug')).rejects.toMatchObject({ status: 400 })
  })
})
