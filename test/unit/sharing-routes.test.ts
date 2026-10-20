import { beforeEach, describe, expect, it } from 'vitest'
import { resetRateLimits } from '../../layers/studio/server/utils/rate-limit'
import { useDeckMeta, usePermissionStore, useProjectPermissionStore } from '../../layers/studio/server/utils/sources'
import { useUserStore } from '../../layers/studio/server/utils/users'
import { anon, asUser, seedAccount, setupServerDb, stubH3Globals } from './helpers/server-db'

// The sharing routes of a deck answer whoever may edit it; the accounts, the
// invitations and the folder grants stay with the owner.
stubH3Globals()
setupServerDb()

const { default: listGrants } = await import('../../layers/studio/server/api/admin/decks/[slug]/permissions.get')
const { default: shareByHandle } = await import('../../layers/studio/server/api/admin/decks/[slug]/permissions.post')
const { default: setGrant } = await import('../../layers/studio/server/api/admin/decks/[slug]/permissions/[userId].put')
const { default: removeGrant } = await import('../../layers/studio/server/api/admin/decks/[slug]/permissions/[userId].delete')
const { default: listFolderGrants } = await import('../../layers/studio/server/api/admin/projects/[slug]/permissions.get')
const { default: setFolderGrant } = await import('../../layers/studio/server/api/admin/projects/[slug]/permissions/[userId].put')
const { default: listUsers } = await import('../../layers/studio/server/api/admin/users.get')
const { default: invite } = await import('../../layers/studio/server/api/admin/users/invite.post')

const owner = (over: Record<string, unknown> = {}) => asUser(1, 'boss', over)
const editor = (over: Record<string, unknown> = {}) => asUser(3, 'ed', over)
const deckEditor = (over: Record<string, unknown> = {}) => asUser(10, 'collab', over)
const reader = (over: Record<string, unknown> = {}) => asUser(11, 'reader', over)
const folderEditor = (over: Record<string, unknown> = {}) => asUser(12, 'folder', over)
const outsider = (over: Record<string, unknown> = {}) => asUser(13, 'outsider', over)
const expiredDeckEditor = (over: Record<string, unknown> = {}) => asUser(14, 'expired', over)
const expiredFolderEditor = (over: Record<string, unknown> = {}) => asUser(15, 'expfolder', over)
const temporary = (over: Record<string, unknown> = {}) => asUser(17, 'temp', over)
const inDays = (n: number) => new Date(Math.floor(Date.now() / 1000 + n * 86_400) * 1000)

const SHARERS = { owner, editor, deckEditor, folderEditor }
const REFUSED = [
  ['a reader of the deck', reader, 403],
  ['a viewer without grant', outsider, 404],
  ['an expired editor grant on the deck', expiredDeckEditor, 404],
  ['an expired editor grant on the folder', expiredFolderEditor, 404],
  ['an anonymous visitor', anon, 401],
] as const

const onDeck = (over: Record<string, unknown> = {}) => ({ params: { slug: 'deck' }, ...over })
const handleBody = (handle: string, role = 'viewer') => ({ account: { provider: 'github', handle }, role })

beforeEach(async () => {
  resetRateLimits()
  await seedAccount(1, 'boss', 'owner')
  await seedAccount(3, 'ed', 'editor')
  await seedAccount(10, 'collab', 'viewer')
  await seedAccount(11, 'reader', 'viewer')
  await seedAccount(12, 'folder', 'viewer')
  await seedAccount(13, 'outsider', 'viewer')
  await seedAccount(14, 'expired', 'viewer')
  await seedAccount(15, 'expfolder', 'viewer')
  await seedAccount(17, 'temp', 'viewer')
  await useDeckMeta().update('deck', { title: 'Deck', status: 'private', project: 'client' })
  await usePermissionStore().set('deck', 10, 'editor', 'boss')
  await usePermissionStore().set('deck', 11, 'viewer', 'boss')
  await useProjectPermissionStore().set('client', 12, 'editor', 'boss')
  await usePermissionStore().set('deck', 14, 'editor', 'boss', new Date(Date.now() - 1000))
  await useProjectPermissionStore().set('client', 15, 'editor', 'boss', new Date(Date.now() - 1000))
  await usePermissionStore().set('deck', 17, 'editor', 'boss', inDays(10))
})

const listedLogins = async () => (await usePermissionStore().listForDeck('deck')).map(g => g.login).sort()

describe('listing the grants of a deck (GET /api/admin/decks/:slug/permissions)', () => {
  for (const [name, as] of Object.entries(SHARERS)) {
    it(`lists the grants to ${name}`, async () => {
      const grants = await listGrants(as(onDeck()))
      expect(grants.map((g: { login: string }) => g.login).sort()).toEqual(['collab', 'expired', 'reader', 'temp'])
    })
  }

  for (const [name, as, status] of REFUSED) {
    it(`refuses ${name} (${status})`, async () => {
      await expect(listGrants(as(onDeck()))).rejects.toMatchObject({ statusCode: status })
    })
  }

  it('refuses a trashed deck, even to the owner (404)', async () => {
    await useDeckMeta().softDelete('deck')
    await expect(listGrants(owner(onDeck()))).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('sharing a deck by handle (POST /api/admin/decks/:slug/permissions)', () => {
  for (const [name, as] of Object.entries(SHARERS)) {
    it(`lets ${name} grant a handle that never logged in, as an invited viewer account`, async () => {
      const result = await shareByHandle(as(onDeck({ body: handleBody('new-person', 'editor') })))
      expect(result).toEqual({ ok: true, slug: 'deck', userId: result.userId, login: 'new-person', role: 'editor' })
      expect(await useUserStore().getRole(result.userId)).toBe('viewer')
      expect((await useUserStore().list()).find(u => u.id === result.userId)?.invited).toBe(true)
      expect(await usePermissionStore().get('deck', result.userId)).toBe('editor')
    })
  }

  it('grants an existing account found by its exact handle', async () => {
    const result = await shareByHandle(deckEditor(onDeck({ body: handleBody('outsider') })))
    expect(result).toMatchObject({ userId: 13 })
    expect(await usePermissionStore().get('deck', 13)).toBe('viewer')
  })

  it('keeps an expiry in the future', async () => {
    // The store keeps seconds.
    const expiresAt = new Date(Math.floor(Date.now() / 1000 + 7 * 86_400) * 1000).toISOString()
    const result = await shareByHandle(deckEditor(onDeck({ body: { ...handleBody('outsider'), expiresAt } })))
    const grant = (await usePermissionStore().listForDeck('deck')).find(g => g.userId === result.userId)
    expect(grant?.expiresAt?.toISOString()).toBe(expiresAt)
  })

  it('refuses a role above editor and a malformed handle (400)', async () => {
    await expect(shareByHandle(deckEditor(onDeck({ body: handleBody('someone', 'owner') })))).rejects.toMatchObject({ statusCode: 400 })
    await expect(shareByHandle(deckEditor(onDeck({ body: { account: { provider: 'google', handle: 'not-an-email' }, role: 'viewer' } })))).rejects.toMatchObject({ statusCode: 400 })
  })

  it('refuses a collaborator writing their own grant (403)', async () => {
    await expect(shareByHandle(deckEditor(onDeck({ body: handleBody('collab', 'editor') })))).rejects.toMatchObject({ statusCode: 403 })
  })

  it('keeps the grant of a collaborator whose access expires within their own term (403 beyond)', async () => {
    await expect(shareByHandle(temporary(onDeck({ body: handleBody('outsider') })))).rejects.toMatchObject({ statusCode: 403 })
    await expect(shareByHandle(temporary(onDeck({ body: { ...handleBody('outsider'), expiresAt: inDays(11).toISOString() } })))).rejects.toMatchObject({ statusCode: 403 })
    await shareByHandle(temporary(onDeck({ body: { ...handleBody('outsider'), expiresAt: inDays(10).toISOString() } })))
    expect(await usePermissionStore().get('deck', 13)).toBe('viewer')
  })

  it('invites nobody when the term is refused', async () => {
    await expect(shareByHandle(temporary(onDeck({ body: handleBody('new-person') })))).rejects.toMatchObject({ statusCode: 403 })
    expect((await useUserStore().list()).map(u => u.login)).not.toContain('new-person')
  })

  it('answers a deck that does not exist with 404, except to the owner', async () => {
    const ghost = { params: { slug: 'ghost-deck' }, body: handleBody('outsider') }
    await expect(shareByHandle(editor(ghost))).rejects.toMatchObject({ statusCode: 404 })
    await expect(shareByHandle(owner(ghost))).resolves.toMatchObject({ ok: true })
  })

  it('refuses a trashed deck (404)', async () => {
    await useDeckMeta().softDelete('deck')
    await expect(shareByHandle(deckEditor(onDeck({ body: handleBody('outsider') })))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('limits the shares of one account (429)', async () => {
    for (let i = 0; i < 30; i++)
      await shareByHandle(deckEditor(onDeck({ body: handleBody(`person-${i}`) })))
    await expect(shareByHandle(deckEditor(onDeck({ body: handleBody('one-more') })))).rejects.toMatchObject({ statusCode: 429 })
    await expect(shareByHandle(editor(onDeck({ body: handleBody('one-more') })))).resolves.toMatchObject({ ok: true })
  })

  for (const [name, as, status] of REFUSED) {
    it(`refuses ${name} (${status}) and invites nobody`, async () => {
      await expect(shareByHandle(as(onDeck({ body: handleBody('new-person') })))).rejects.toMatchObject({ statusCode: status })
      expect((await useUserStore().list()).map(u => u.login)).not.toContain('new-person')
    })
  }
})

describe('changing a grant (PUT /api/admin/decks/:slug/permissions/:userId)', () => {
  for (const [name, as] of Object.entries(SHARERS)) {
    it(`lets ${name} change the role of a listed grant`, async () => {
      await setGrant(as(onDeck({ params: { slug: 'deck', userId: '11' }, body: { role: 'editor' } })))
      expect(await usePermissionStore().get('deck', 11)).toBe('editor')
    })
  }

  it('lets the owner grant any account by its id', async () => {
    await setGrant(owner(onDeck({ params: { slug: 'deck', userId: '13' }, body: { role: 'viewer' } })))
    expect(await usePermissionStore().get('deck', 13)).toBe('viewer')
  })

  it('refuses another sharer an account the deck does not list (404), so ids reveal no login', async () => {
    await expect(setGrant(editor(onDeck({ params: { slug: 'deck', userId: '13' }, body: { role: 'viewer' } })))).rejects.toMatchObject({ statusCode: 404 })
    await expect(setGrant(deckEditor(onDeck({ params: { slug: 'deck', userId: '13' }, body: { role: 'viewer' } })))).rejects.toMatchObject({ statusCode: 404 })
    expect(await usePermissionStore().get('deck', 13)).toBeNull()
  })

  it('refuses a collaborator extending their own grant (403)', async () => {
    await expect(setGrant(deckEditor(onDeck({ params: { slug: 'deck', userId: '10' }, body: { role: 'editor', expiresAt: null } })))).rejects.toMatchObject({ statusCode: 403 })
  })

  it('refuses a collaborator whose access expires to extend a grant past it (403)', async () => {
    const put = (body: Record<string, unknown>) => setGrant(temporary(onDeck({ params: { slug: 'deck', userId: '11' }, body })))
    await expect(put({ role: 'viewer', expiresAt: inDays(30).toISOString() })).resolves.toMatchObject({ ok: true })
    await expect(put({ role: 'viewer', expiresAt: inDays(40).toISOString() })).rejects.toMatchObject({ statusCode: 403 })
    await expect(put({ role: 'editor', expiresAt: inDays(30).toISOString() })).rejects.toMatchObject({ statusCode: 403 })
    await expect(put({ role: 'editor', expiresAt: inDays(10).toISOString() })).resolves.toMatchObject({ ok: true })
    await expect(put({ role: 'editor', expiresAt: null })).rejects.toMatchObject({ statusCode: 403 })
    await expect(put({ role: 'viewer', expiresAt: inDays(5).toISOString() })).resolves.toMatchObject({ ok: true })
  })

  it('holds a raised role to that collaborator\'s term, and lowers a permanent grant without one', async () => {
    const put = (body: Record<string, unknown>) => setGrant(temporary(onDeck({ params: { slug: 'deck', userId: '11' }, body })))
    await expect(put({ role: 'editor', expiresAt: null })).rejects.toMatchObject({ statusCode: 403 })
    await usePermissionStore().set('deck', 11, 'editor', 'boss')
    await expect(put({ role: 'viewer', expiresAt: null })).resolves.toMatchObject({ ok: true })
  })

  it('keeps the account that collaborator promotes from extending them in turn (403)', async () => {
    await expect(setGrant(temporary(onDeck({ params: { slug: 'deck', userId: '11' }, body: { role: 'editor', expiresAt: null } })))).rejects.toMatchObject({ statusCode: 403 })
    await setGrant(temporary(onDeck({ params: { slug: 'deck', userId: '11' }, body: { role: 'editor', expiresAt: inDays(10).toISOString() } })))
    await expect(setGrant(reader(onDeck({ params: { slug: 'deck', userId: '17' }, body: { role: 'editor', expiresAt: null } })))).rejects.toMatchObject({ statusCode: 403 })
    const grant = (await usePermissionStore().listForDeck('deck')).find(g => g.userId === 17)
    expect(grant?.expiresAt?.toISOString()).toBe(inDays(10).toISOString())
  })

  it('refuses a trashed deck (404)', async () => {
    await useDeckMeta().softDelete('deck')
    await expect(setGrant(deckEditor(onDeck({ params: { slug: 'deck', userId: '11' }, body: { role: 'editor' } })))).rejects.toMatchObject({ statusCode: 404 })
  })

  for (const [name, as, status] of REFUSED) {
    it(`refuses ${name} (${status})`, async () => {
      await expect(setGrant(as(onDeck({ params: { slug: 'deck', userId: '11' }, body: { role: 'editor' } })))).rejects.toMatchObject({ statusCode: status })
      expect(await usePermissionStore().get('deck', 11)).toBe('viewer')
    })
  }
})

describe('removing a grant (DELETE /api/admin/decks/:slug/permissions/:userId)', () => {
  for (const [name, as] of Object.entries(SHARERS)) {
    it(`lets ${name} remove a grant`, async () => {
      await removeGrant(as(onDeck({ params: { slug: 'deck', userId: '11' } })))
      expect(await usePermissionStore().get('deck', 11)).toBeNull()
    })
  }

  it('lets a collaborator remove their own grant', async () => {
    await removeGrant(deckEditor(onDeck({ params: { slug: 'deck', userId: '10' } })))
    expect(await listedLogins()).not.toContain('collab')
  })

  it('refuses a trashed deck (404)', async () => {
    await useDeckMeta().softDelete('deck')
    await expect(removeGrant(deckEditor(onDeck({ params: { slug: 'deck', userId: '11' } })))).rejects.toMatchObject({ statusCode: 404 })
  })

  for (const [name, as, status] of REFUSED) {
    it(`refuses ${name} (${status})`, async () => {
      await expect(removeGrant(as(onDeck({ params: { slug: 'deck', userId: '11' } })))).rejects.toMatchObject({ statusCode: status })
      expect(await usePermissionStore().get('deck', 11)).toBe('viewer')
    })
  }
})

describe('listing the grants of a folder (GET /api/admin/projects/:slug/permissions)', () => {
  const onFolder = (deck?: string) => ({ params: { slug: 'client' }, query: deck ? { deck } : {} })

  it('lists the folder grants to the owner', async () => {
    expect((await listFolderGrants(owner(onFolder()))).map((g: { login: string }) => g.login).sort()).toEqual(['expfolder', 'folder'])
  })

  for (const [name, as] of Object.entries(SHARERS)) {
    it(`lists them to ${name} through a deck of the folder`, async () => {
      expect((await listFolderGrants(as(onFolder('deck')))).map((g: { login: string }) => g.login).sort()).toEqual(['expfolder', 'folder'])
    })
  }

  it('answers a deck the account may not see as a deck that does not exist (404)', async () => {
    await expect(listFolderGrants(outsider(onFolder('deck')))).rejects.toMatchObject({ statusCode: 404 })
    await expect(listFolderGrants(outsider(onFolder('no-such-deck')))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('refuses another sharer without a deck, or with a deck of another folder (403)', async () => {
    await useDeckMeta().update('elsewhere', { title: 'Elsewhere', status: 'private', project: 'other' })
    await usePermissionStore().set('elsewhere', 10, 'editor', 'boss')
    await expect(listFolderGrants(editor(onFolder()))).rejects.toMatchObject({ statusCode: 403 })
    await expect(listFolderGrants(deckEditor(onFolder('elsewhere')))).rejects.toMatchObject({ statusCode: 403 })
  })

  for (const [name, as, status] of REFUSED) {
    it(`refuses ${name} through the deck (${status})`, async () => {
      await expect(listFolderGrants(as(onFolder('deck')))).rejects.toMatchObject({ statusCode: status })
    })
  }
})

describe('the routes the owner keeps', () => {
  it('refuses a folder grant, the account list and an invitation to a global editor (403)', async () => {
    await expect(setFolderGrant(editor({ params: { slug: 'client', userId: '13' }, body: { role: 'viewer' } }))).rejects.toMatchObject({ statusCode: 403 })
    await expect(listUsers(editor())).rejects.toMatchObject({ statusCode: 403 })
    await expect(invite(editor({ body: { provider: 'github', handle: 'someone' } }))).rejects.toMatchObject({ statusCode: 403 })
  })

  it('refuses the same to the editor of a deck and of a folder (403)', async () => {
    for (const as of [deckEditor, folderEditor]) {
      await expect(setFolderGrant(as({ params: { slug: 'client', userId: '13' }, body: { role: 'viewer' } }))).rejects.toMatchObject({ statusCode: 403 })
      await expect(listUsers(as())).rejects.toMatchObject({ statusCode: 403 })
      await expect(invite(as({ body: { provider: 'github', handle: 'someone' } }))).rejects.toMatchObject({ statusCode: 403 })
    }
  })
})
