import process from 'node:process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isFreezeRead } from '../../layers/studio/server/utils/access'
import { useDbContent, useDeckMeta } from '../../layers/studio/server/utils/sources'
import { anon, setupServerDb, stubH3Globals } from './helpers/server-db'

stubH3Globals()
setupServerDb()
beforeAll(() => {
  process.env.BUNDLE_ONLY_SLUG = 'secret'
})
afterAll(() => {
  delete process.env.BUNDLE_ONLY_SLUG
})

const { default: getDeck } = await import('../../layers/studio/server/api/presentations/[slug].get')

describe('the read of a deck by its freeze', () => {
  it('is the prerender of the bundle of that deck alone', () => {
    expect(isFreezeRead(true, { onlySlug: 'secret' }, 'secret')).toBe(true)
    expect(isFreezeRead(true, { onlySlug: 'secret' }, 'other')).toBe(false)
    expect(isFreezeRead(true, {}, 'secret')).toBe(false)
    expect(isFreezeRead(undefined, { onlySlug: 'secret' }, 'secret')).toBe(false)
  })

  it('keeps a running server gated, even with the bundle variable set', async () => {
    await useDbContent().writer.save({ slug: 'secret', raw: '---\ntitle: Secret\n---\n\n# Secret', actor: 'test' })
    await useDeckMeta().update('secret', { status: 'private', published: true })

    await expect(getDeck(anon({ params: { slug: 'secret' } }))).rejects.toMatchObject({ statusCode: 401 })
  })
})
