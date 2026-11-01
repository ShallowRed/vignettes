import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { parserIdFor, slideRanges, splitFrontmatter } from '@vignettes/core/deck'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { decideMediaAccess } from '../../layers/studio/server/utils/access'
import { mintToken, useTokenStore } from '../../layers/studio/server/utils/personal-token'
import { hasRecetteData, isRecetteSeeded, recetteImages, resetRecette } from '../../layers/studio/server/utils/recette'
import { useDbContent, useDeckMeta, useGrants, useMediaIndex } from '../../layers/studio/server/utils/sources'
import { useUserStore } from '../../layers/studio/server/utils/users'
import { RECETTE_INVITED_HANDLE, RECETTE_PERSONAS } from '../../layers/studio/shared/recette/personas'
import { anon, asUser, seedAccount, setupServerDb, stubH3Globals } from './helpers/server-db'

// The kit is gated twice: the environment flag, then an owner session (which
// mints the pass) or the pass itself. Persona logins and the seed run against
// the real stores on a migrated temp database.
stubH3Globals()
setupServerDb()
process.env.NUXT_SESSION_PASSWORD = 'recette-test-password-with-32-chars'
process.env.NUXT_RECETTE_ENABLED = '1'

const { default: status } = await import('../../layers/studio/server/api/recette/status.get')
const { default: seed } = await import('../../layers/studio/server/api/recette/seed.post')
const { default: openAs } = await import('../../layers/studio/server/routes/auth/recette')
const { default: logout } = await import('../../layers/studio/server/routes/auth/logout')

// The seeded images land in `.media/` under the working directory.
const cwd = process.cwd()
const workdir = mkdtempSync(join(tmpdir(), 'recette-'))
beforeAll(() => process.chdir(workdir))
afterAll(() => {
  process.chdir(cwd)
  rmSync(workdir, { recursive: true, force: true })
})

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

  it('refuses the pass once its holder stopped being an owner', async () => {
    const pass = await ownerPass()
    await useUserStore().setRole(1, 'viewer')
    try {
      await expect(status(asUser(2, 'v', { cookies: { recette_pass: pass } }))).rejects.toMatchObject({ statusCode: 403 })
    }
    finally {
      await useUserStore().setRole(1, 'owner')
    }
  })

  it('refuses the pass after a logout of its holder, which also removes it from the browser', async () => {
    const pass = await ownerPass()
    const signOut = asUser(1, 'boss', { method: 'POST', cookies: { recette_pass: pass } })
    await logout(signOut)
    expect(signOut.deletedCookies).toContain('recette_pass')
    await expect(status(asUser(2, 'v', { cookies: { recette_pass: pass } }))).rejects.toMatchObject({ statusCode: 403 })
  })

  it('refuses the pass once its id names another owner (403)', async () => {
    const pass = await ownerPass()
    await useUserStore().remove(1)
    await seedAccount(1, 'eve', 'owner')
    await expect(status(asUser(2, 'v', { cookies: { recette_pass: pass } }))).rejects.toMatchObject({ statusCode: 403 })
  })
})

describe('persona switch', () => {
  it('opens the app as a persona with its role, and `me` restores the owner', async () => {
    const pass = await ownerPass()
    const asCollab = asUser(2, 'v', { cookies: { recette_pass: pass }, method: 'POST', body: { as: 'collab', redirect: '/projects/recette-partage' } })
    await openAs(asCollab)
    expect(asCollab.sessionSet.user).toMatchObject({ id: persona('collab').id, role: 'viewer' })
    expect(asCollab.redirectedTo).toBe('/projects/recette-partage')
    await expect(useUserStore().getAccount(persona('collab').id)).resolves.toMatchObject({ role: 'viewer' })

    const back = asUser(persona('collab').id, 'recette-collab', { cookies: { recette_pass: pass }, method: 'POST', body: { as: 'me' } })
    await openAs(back)
    expect(back.sessionSet.user).toMatchObject({ id: 1, login: 'boss' })
    expect(back.redirectedTo).toBe('/')
  })

  it('opens the app without a session as the anonymous visitor, and keeps the pass', async () => {
    const pass = await ownerPass()
    const asVisitor = asUser(1, 'boss', { cookies: { recette_pass: pass }, method: 'POST', body: { as: 'anonymous', redirect: '/slides/recette-mdp' } })
    await openAs(asVisitor)
    expect(asVisitor.sessionCleared).toBe(true)
    expect(asVisitor.sessionSet).toBeUndefined()
    expect(asVisitor.redirectedTo).toBe('/slides/recette-mdp')
  })

  it('answers 405 to a GET, which a link on another site can send', async () => {
    const pass = await ownerPass()
    await expect(openAs(asUser(1, 'boss', { cookies: { recette_pass: pass }, query: { as: 'collab' } }))).rejects.toMatchObject({ statusCode: 405 })
  })

  it('opens for the personal token of an owner, and refuses the token of an editor (403)', async () => {
    const tokenOf = async (id: number) => {
      const { secret, tokenHash, prefix } = mintToken()
      await useTokenStore().create(id, { name: 'recette', scope: 'write', tokenHash, prefix, expiresAt: new Date(Date.now() + 86_400_000) }, new Date())
      return secret
    }
    const request = (secret: string) => anon({ method: 'POST', path: '/auth/recette', headers: { authorization: `Bearer ${secret}` }, body: { as: 'viewer' } })
    await seedAccount(1, 'boss', 'owner')
    const byOwner = request(await tokenOf(1))
    await openAs(byOwner)
    expect(byOwner.sessionSet.user).toMatchObject({ id: persona('viewer').id, role: 'viewer' })
    expect(byOwner.setCookies.recette_pass).toBeDefined()
    await seedAccount(3, 'eve', 'editor')
    await expect(openAs(request(await tokenOf(3)))).rejects.toMatchObject({ statusCode: 403 })
  })

  it('rejects an unknown persona (400)', async () => {
    await ownerPass()
    await expect(openAs(asUser(1, 'boss', { method: 'POST', body: { as: 'root' } }))).rejects.toMatchObject({ statusCode: 400 })
  })
})

describe('seed', () => {
  it('creates the data set idempotently and leaves other rows alone', async () => {
    await seedAccount(1, 'boss', 'owner')
    await useDeckMeta().update('mine', { title: 'Mon deck' })

    const first = await seed(asUser(1, 'boss'))
    const again = await seed(asUser(1, 'boss'))
    expect(again).toEqual(first)
    expect(first).toMatchObject({ folders: 2, decks: 9, accounts: 6 })
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

  it('seeds decks that split into several slides', async () => {
    await seedAccount(1, 'boss', 'owner')
    await seed(asUser(1, 'boss'))
    const raw = (await useDbContent().source.load('recette-public'))!.raw
    const { data } = splitFrontmatter(raw)
    // The bodies open their slides with headings, so they have to say so: a deck
    // that declares nothing splits on `---`, and this one carries none.
    expect(parserIdFor(data)).toBe('heading')
    expect(slideRanges(raw, parserIdFor(data)).length).toBeGreaterThan(1)
  })

  it('seeds an image that follows the visibility of its deck', async () => {
    await seedAccount(1, 'boss', 'owner')
    await seed(asUser(1, 'boss'))
    const images = recetteImages()
    const nameOf = (slug: string) => images[slug]!.replace('/media/', '')
    expect(await decideMediaAccess(anon(), nameOf('recette-public'))).toMatchObject({ allowed: true })
    expect(await decideMediaAccess(anon(), nameOf('recette-privee'))).toMatchObject({ allowed: false })
    expect(await decideMediaAccess(asUser(1, 'boss'), nameOf('recette-privee'))).toMatchObject({ allowed: true })
  })

  it('keeps a private image private when a public deck cites it', async () => {
    await seedAccount(1, 'boss', 'owner')
    await seed(asUser(1, 'boss'))
    const name = recetteImages()['recette-privee']!.replace('/media/', '')
    expect(await decideMediaAccess(anon(), name)).toMatchObject({ allowed: false })

    // What an editor of the public deck can do: write the name into its draft.
    await useMediaIndex().recordFromMarkdown('recette-public', `![](/media/${name})`)

    expect(await decideMediaAccess(anon(), name)).toMatchObject({ allowed: false })
  })

  it('counts the data set as present only when every deck exists', async () => {
    await seedAccount(1, 'boss', 'owner')
    expect(await isRecetteSeeded()).toBe(false)
    await seed(asUser(1, 'boss'))
    expect(await isRecetteSeeded()).toBe(true)
    await useDeckMeta().purge('recette-english')
    expect(await isRecetteSeeded()).toBe(false)
  })

  it('spares a deck that only shares the prefix, and the kit folder holding it', async () => {
    await seedAccount(1, 'boss', 'owner')
    await seed(asUser(1, 'boss'))
    await useDbContent().writer.save({ slug: 'recette-de-cuisine', raw: '---\ntitle: Mine\nproject: recette-partage\n---\n\n# Mine', actor: 'boss' })
    await useDeckMeta().update('recette-de-cuisine', { title: 'Mine', project: 'recette-partage' })

    await resetRecette()

    expect(await useDeckMeta().existsIncludingTrashed('recette-de-cuisine')).toBe(true)
    expect(await useDeckMeta().existsIncludingTrashed('recette-public')).toBe(false)
    // The folder stays with the deck it holds, and a new seed reuses it.
    await expect(seed(asUser(1, 'boss'))).resolves.toBeDefined()
    expect(await useDeckMeta().existsIncludingTrashed('recette-de-cuisine')).toBe(true)
  })

  it('leaves nothing behind when the kit is removed', async () => {
    await seedAccount(1, 'boss', 'owner')
    expect(await hasRecetteData()).toBe(false)
    await seed(asUser(1, 'boss'))
    expect(await hasRecetteData()).toBe(true)

    await resetRecette()

    expect(await hasRecetteData()).toBe(false)
    const accounts = await useUserStore().list()
    expect(accounts.filter(a => a.login.startsWith('recette-'))).toEqual([])
    expect(accounts.find(a => a.login === RECETTE_INVITED_HANDLE)).toBeUndefined()
  })
})
