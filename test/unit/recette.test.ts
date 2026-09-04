import process from 'node:process'
import { describe, expect, it } from 'vitest'
import { useDeckMeta, useGrants } from '../../server/utils/sources'
import { useUserStore } from '../../server/utils/users'
import { RECETTE_INVITED_HANDLE, RECETTE_PERSONAS } from '../../shared/recette/personas'
import { asUser, seedAccount, setupServerDb, stubH3Globals } from './helpers/server-db'

// The kit is gated twice: the environment flag, then an owner session (which
// mints the pass) or the pass itself. Persona logins and the seed run against
// the real stores on a migrated temp database.
stubH3Globals()
setupServerDb()
process.env.NUXT_SESSION_PASSWORD = 'recette-test-password-with-32-chars'
process.env.NUXT_RECETTE_ENABLED = '1'

const { default: status } = await import('../../server/api/recette/status.get')
const { default: seed } = await import('../../server/api/recette/seed.post')
const { default: openAs } = await import('../../server/routes/auth/recette.get')

const persona = (key: string) => RECETTE_PERSONAS.find(p => p.key === key)!

/** An owner opens the kit; returns the pass cookie their browser now holds. */
async function ownerPass(): Promise<string> {
  await seedAccount(1, 'boss', 'owner')
  const event = asUser(1, 'boss')
  await status(event)
  return event.setCookies.recette_pass
}

describe('recette kit gate', () => {
  it('stays absent when the flag is off (404)', async () => {
    delete process.env.NUXT_RECETTE_ENABLED
    try {
      await seedAccount(1, 'boss', 'owner')
      await expect(status(asUser(1, 'boss'))).rejects.toMatchObject({ statusCode: 404 })
    }
    finally {
      process.env.NUXT_RECETTE_ENABLED = '1'
    }
  })

  it('opens for an owner, who receives the pass; refuses a viewer without one (403)', async () => {
    const pass = await ownerPass()
    expect(pass).toMatch(/^[\w-]+\.[\w-]+$/)
    await seedAccount(2, 'v', 'viewer')
    await expect(status(asUser(2, 'v'))).rejects.toMatchObject({ statusCode: 403 })
    await expect(status(asUser(2, 'v', { cookies: { recette_pass: pass } }))).resolves.toMatchObject({ owner: 'boss' })
  })

  it('refuses a tampered pass', async () => {
    const pass = await ownerPass()
    const [payload] = pass.split('.')
    await expect(status(asUser(2, 'v', { cookies: { recette_pass: `${payload}.forged` } }))).rejects.toMatchObject({ statusCode: 403 })
  })
})

describe('persona switch', () => {
  it('opens the app as a persona with its role, and `me` restores the owner', async () => {
    const pass = await ownerPass()
    const asCollab = asUser(2, 'v', { cookies: { recette_pass: pass }, query: { as: 'collab', redirect: '/projects/recette-partage' } })
    await openAs(asCollab)
    expect(asCollab.sessionSet.user).toMatchObject({ id: persona('collab').id, role: 'viewer' })
    expect(asCollab.redirectedTo).toBe('/projects/recette-partage')
    await expect(useUserStore().getRole(persona('collab').id)).resolves.toBe('viewer')

    const back = asUser(persona('collab').id, 'recette-collab', { cookies: { recette_pass: pass }, query: { as: 'me' } })
    await openAs(back)
    expect(back.sessionSet.user).toMatchObject({ id: 1, login: 'boss' })
    expect(back.redirectedTo).toBe('/')
  })

  it('rejects an unknown persona (400)', async () => {
    await ownerPass()
    await expect(openAs(asUser(1, 'boss', { query: { as: 'root' } }))).rejects.toMatchObject({ statusCode: 400 })
  })
})

describe('seed', () => {
  it('creates the data set idempotently and leaves other rows alone', async () => {
    await seedAccount(1, 'boss', 'owner')
    await useDeckMeta().update('mine', { title: 'Mon deck' })

    const first = await seed(asUser(1, 'boss'))
    const again = await seed(asUser(1, 'boss'))
    expect(again).toEqual(first)
    expect(first).toMatchObject({ folders: 2, decks: 8, accounts: 6 })
    expect(await useDeckMeta().get('mine')).not.toBeNull()

    const grants = useGrants()
    // The folder master key reaches every deck in the folder; the expired one reaches none.
    await expect(grants.get('recette-public', persona('collab').id)).resolves.toBe('editor')
    await expect(grants.get('recette-brouillon', persona('collab').id)).resolves.toBe('editor')
    await expect(grants.get('recette-lecture', persona('collab').id)).resolves.toBe('viewer')
    await expect(grants.get('recette-public', persona('expired').id)).resolves.toBeUndefined()

    expect(await useDeckMeta().isTrashed('recette-corbeille')).toBe(true)
    expect(await useDeckMeta().get('recette-brouillon')).toMatchObject({ managed: true, published: false })
    expect(await useDeckMeta().get('recette-non-listee')).toMatchObject({ status: 'public', unlisted: true })

    const accounts = await useUserStore().list()
    expect(accounts.find(a => a.login === RECETTE_INVITED_HANDLE)).toMatchObject({ invited: true })
    expect(accounts.filter(a => a.login.startsWith('recette-'))).toHaveLength(RECETTE_PERSONAS.length)
  })
})
