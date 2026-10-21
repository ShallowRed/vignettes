import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { assertOwner, assertPrivileged } from '../../layers/studio/server/utils/access'
import { useDeckMeta } from '../../layers/studio/server/utils/sources'
import { bearer, setupServerDb, stubH3Globals, testRows } from './helpers/server-db'

// The content token stands in for a session on the markdown write path and the content script routes.
stubH3Globals()
setupServerDb()

const { default: saveDraft } = await import('../../layers/studio/server/api/presentations/[slug].put')
const { default: publish } = await import('../../layers/studio/server/api/presentations/[slug]/publish.post')
const { default: loadDeck } = await import('../../layers/studio/server/api/presentations/[slug].get')
const { default: uploadMedia } = await import('../../layers/studio/server/api/media.post')
const { default: listHistory } = await import('../../layers/studio/server/api/presentations/[slug]/history.get')
const { default: duplicate } = await import('../../layers/studio/server/api/presentations/[slug]/duplicate.post')

const deck = { params: { slug: 'deck' } }
const raw = '---\ntitle: Deck\n---\n\n# Hello\n'

let previous: string | undefined
beforeAll(() => {
  previous = process.env.NUXT_CONTENT_TOKEN
  process.env.NUXT_CONTENT_TOKEN = 'secret-token'
})
beforeEach(async () => {
  await useDeckMeta().update('deck', { title: 'Deck' })
})
afterAll(() => {
  if (previous === undefined)
    delete process.env.NUXT_CONTENT_TOKEN
  else process.env.NUXT_CONTENT_TOKEN = previous
})

describe('content token on the markdown write path', () => {
  it('saves a draft and publishes it, signed as the token', async () => {
    await expect(saveDraft(bearer('secret-token', { ...deck, body: { raw } }))).resolves.toMatchObject({ ok: true })
    await expect(publish(bearer('secret-token', deck))).resolves.toMatchObject({ ok: true })
    const [version] = await testRows().select('deckVersions', { deckSlug: 'deck' })
    expect(version).toMatchObject({ raw, publishedBy: 'content-token' })
  })

  it('reads the draft state the way the editor does', async () => {
    await saveDraft(bearer('secret-token', { ...deck, body: { raw } }))
    const state = loadDeck(bearer('secret-token', { ...deck, query: { draft: '' } }))
    await expect(state).resolves.toMatchObject({ from: 'draft', publishedRaw: null, content: raw })
  })

  it('refuses a wrong token, and any token when none is configured (401)', async () => {
    await expect(saveDraft(bearer('nope', { ...deck, body: { raw } }))).rejects.toMatchObject({ statusCode: 401 })
    const token = process.env.NUXT_CONTENT_TOKEN
    delete process.env.NUXT_CONTENT_TOKEN
    await expect(saveDraft(bearer('secret-token', { ...deck, body: { raw } }))).rejects.toMatchObject({ statusCode: 401 })
    process.env.NUXT_CONTENT_TOKEN = token
  })

  it('opens nothing else: media upload, privileged and owner guards stay closed (401)', async () => {
    await expect(uploadMedia(bearer('secret-token', { query: { deck: 'deck' } }))).rejects.toMatchObject({ statusCode: 401 })
    await expect(assertPrivileged(bearer('secret-token'))).rejects.toMatchObject({ statusCode: 401 })
    await expect(assertOwner(bearer('secret-token'))).rejects.toMatchObject({ statusCode: 401 })
  })

  it('opens neither the history nor the copy of a deck', async () => {
    await expect(listHistory(bearer('secret-token', deck))).rejects.toMatchObject({ statusCode: 401 })
    await expect(duplicate(bearer('secret-token', { ...deck, body: { slug: 'copy', mode: 'variant' } }))).rejects.toMatchObject({ statusCode: 401 })
  })
})
