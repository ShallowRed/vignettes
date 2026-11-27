import { beforeEach, describe, expect, it } from 'vitest'
import { useDbContent } from '../../layers/studio/server/utils/sources'
import { asUser, seedAccount, setupServerDb, stubH3Globals } from './helpers/server-db'

// Drive the publication handler directly, as deck-write-handlers.test.ts does for the other writes.
stubH3Globals()
setupServerDb()

const { default: saveDraft } = await import('../../layers/studio/server/api/presentations/[slug].put')
const { default: publishDeck } = await import('../../layers/studio/server/api/presentations/[slug]/publish.post')

const editor = (over: Record<string, unknown>) => asUser(3, 'ed', over)
const RAW = '---\ntitle: Deck\n---\n\n# Hello\n'
const publish = (body?: unknown) => publishDeck(editor({ params: { slug: 'deck' }, ...(body === undefined ? {} : { body }) }))
const published = async () => (await useDbContent().source.load('deck'))?.raw

beforeEach(async () => {
  await seedAccount(3, 'ed', 'editor')
  await saveDraft(editor({ params: { slug: 'deck' }, body: { raw: RAW } }))
})

describe('publishing a draft (POST /api/presentations/:slug/publish)', () => {
  it('publishes the draft without a body, and answers without a digest', async () => {
    const answer = await publish()
    expect(answer).toEqual({ ok: true, key: expect.any(String), bytes: new TextEncoder().encode(RAW).length })
    expect(await published()).toBe(RAW)
  })
})
