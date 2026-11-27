import { textDigest } from '@vignettes/core/digest'
import { beforeEach, describe, expect, it } from 'vitest'
import { useCollabServer } from '../../layers/studio/server/utils/collab'
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
    expect(answer).toEqual({ ok: true, key: 'db:deck', bytes: new TextEncoder().encode(RAW).length })
    expect(await published()).toBe(RAW)
  })

  it('publishes the draft whose digest it receives, and answers that digest', async () => {
    const digest = await textDigest(RAW)
    await expect(publish({ digest })).resolves.toMatchObject({ ok: true, digest })
    expect(await published()).toBe(RAW)
  })

  it('refuses a digest that differs from the stored draft (409)', async () => {
    await expect(publish({ digest: await textDigest('# Other') })).rejects.toMatchObject({ statusCode: 409, data: { conflict: true } })
    expect(await published()).toBeUndefined()
  })

  it('refuses a digest that differs from the text of an open room (409)', async () => {
    const connection = await useCollabServer().openDirectConnection('deck', { deck: 'deck' })
    try {
      await connection.transact(document => document.getText('codemirror').insert(0, 'typed\n'))
      await expect(publish({ digest: await textDigest(RAW) })).rejects.toMatchObject({ statusCode: 409, data: { conflict: true } })
      expect(await published()).toBeUndefined()
      await expect(publish({ digest: await textDigest(`typed\n${RAW}`) })).resolves.toMatchObject({ ok: true })
    }
    finally {
      await connection.disconnect()
    }
  })

  it('refuses a digest of another form (400) without publishing', async () => {
    const digest = await textDigest(RAW)
    for (const malformed of [42, null, digest.slice(1), digest.toUpperCase()])
      await expect(publish({ digest: malformed })).rejects.toMatchObject({ statusCode: 400, statusMessage: 'digest must be the SHA-256 of the text, in lowercase hexadecimal' })
    expect(await published()).toBeUndefined()
  })
})
