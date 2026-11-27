import process from 'node:process'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { gateOptionsOf } from '../../layers/studio/server/utils/access'
import { listVisiblePresentations } from '../../layers/studio/server/utils/catalog'
import { useGrants, usePermissionStore, useProjectPermissionStore } from '../../layers/studio/server/utils/sources'
import { anon, asUser, seedAccount, setupServerDb, stubH3Globals, testRows } from './helpers/server-db'

// The access axes a publication gives a deck row that is not managed, by the account that publishes.
stubH3Globals()
setupServerDb()

const { default: saveDraft } = await import('../../layers/studio/server/api/presentations/[slug].put')
const { default: publishDeck } = await import('../../layers/studio/server/api/presentations/[slug]/publish.post')
const { default: loadDeck } = await import('../../layers/studio/server/api/presentations/[slug].get')

const editor = (over: Record<string, unknown> = {}) => asUser(3, 'ed', over)
const collab = (over: Record<string, unknown> = {}) => asUser(10, 'collab', over)
const contentToken = (over: Record<string, unknown> = {}) => anon({ headers: { authorization: 'Bearer secret-token' }, ...over })
const slug = { params: { slug: 'deck' } }

const OPEN_TEXT = `---
title: Ouvert
status: public
project: autre
---

# Contenu
`
const PUBLISHED_TEXT = `---
title: Publié
status: public
project: ancien
accessPassword: hash-of-the-published-text
---

# Contenu
`
const CLOSED_TEXT = `---
title: Fermé
status: private
project: autre
unlisted: false
---

# Contenu
`

async function axes() {
  const [row] = await testRows().select('decks', { slug: 'deck' })
  return { status: row!.status, unlisted: row!.unlisted, accessPasswordHash: row!.accessPasswordHash, project: row!.project, managed: row!.managed }
}
const listedTo = async (event: unknown) => (await listVisiblePresentations(event as any)).some(deck => deck.slug === 'deck')

let previous: string | undefined
beforeAll(() => {
  previous = process.env.NUXT_CONTENT_TOKEN
  process.env.NUXT_CONTENT_TOKEN = 'secret-token'
})
beforeEach(async () => {
  await seedAccount(3, 'ed', 'editor')
  await seedAccount(10, 'collab', 'viewer')
})
afterAll(() => {
  if (previous === undefined)
    delete process.env.NUXT_CONTENT_TOKEN
  else process.env.NUXT_CONTENT_TOKEN = previous
})

describe('the first publication of a row that is not managed and has no published version', () => {
  beforeEach(async () => {
    // The draft save inserts the row unmanaged, without a folder.
    await saveDraft(editor({ ...slug, body: { raw: OPEN_TEXT } }))
    expect(await axes()).toMatchObject({ managed: false, project: null })
  })

  it('by a collaborator with an editor grant on the deck, takes the access axes of the text', async () => {
    await usePermissionStore().set('deck', 10, 'editor', 'boss')
    await publishDeck(collab(slug))
    expect(await axes()).toEqual({ status: 'public', unlisted: false, accessPasswordHash: null, project: 'autre', managed: true })
  })

  it('by an account with the editor role, takes the access axes of the text', async () => {
    await publishDeck(editor(slug))
    expect(await axes()).toEqual({ status: 'public', unlisted: false, accessPasswordHash: null, project: 'autre', managed: true })
  })

  it('by the content token, takes the access axes of the text', async () => {
    await publishDeck(contentToken(slug))
    expect(await axes()).toEqual({ status: 'public', unlisted: false, accessPasswordHash: null, project: 'autre', managed: true })
  })
})

describe('a publication of a row that is not managed and has a published version', () => {
  beforeEach(async () => {
    await saveDraft(editor({ ...slug, body: { raw: PUBLISHED_TEXT } }))
    await publishDeck(editor(slug))
    // As the migration 0002 of SQLite leaves a row published before it: the
    // access comes from the published text, the folder and the catalog from the columns.
    await testRows().update('decks', { managed: false, status: 'private', accessPasswordHash: null, project: 'equipe', unlisted: true }, { slug: 'deck' })
    await saveDraft(editor({ ...slug, body: { raw: CLOSED_TEXT } }))
    await useProjectPermissionStore().set('equipe', 10, 'editor', 'boss')
    expect(await gateOptionsOf('deck')).toMatchObject({ status: 'public', storedHash: 'hash-of-the-published-text' })
    expect(await loadDeck(editor(slug))).toMatchObject({ status: 'public' })
  })

  it('by a collaborator with an editor grant on the folder, takes the access axes of the new text', async () => {
    await publishDeck(collab(slug))
    expect(await gateOptionsOf('deck')).toMatchObject({ status: 'private', storedHash: undefined })
    expect(await loadDeck(editor(slug))).toMatchObject({ status: 'private' })
    expect(await axes()).toEqual({ status: 'private', unlisted: false, accessPasswordHash: null, project: 'autre', managed: true })
    expect(await useGrants().get('deck', 10)).toBeUndefined()
    expect(await listedTo(collab())).toBe(false)
    expect(await listedTo(editor())).toBe(true)
    expect(await listedTo(anon())).toBe(false)
  })

  it('by an account with the editor role, takes the access axes of the new text', async () => {
    await publishDeck(editor(slug))
    expect(await gateOptionsOf('deck')).toMatchObject({ status: 'private', storedHash: undefined })
    expect(await axes()).toEqual({ status: 'private', unlisted: false, accessPasswordHash: null, project: 'autre', managed: true })
  })
})
