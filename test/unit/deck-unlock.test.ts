import { randomBytes, scryptSync } from 'node:crypto'
import process from 'node:process'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { verifyAccessPass } from '../../layers/studio/server/utils/access-pass'
import { hashAccessPassword } from '../../layers/studio/server/utils/password'
import { resetRateLimits } from '../../layers/studio/server/utils/rate-limit'
import { useDbContent, useDeckMeta } from '../../layers/studio/server/utils/sources'
import { anon, setupServerDb, stubH3Globals } from './helpers/server-db'

stubH3Globals()
setupServerDb()
process.env.NUXT_SESSION_PASSWORD = 'deck-unlock-password-with-32-characters'
beforeEach(resetRateLimits)

const { default: unlockBySlug } = await import('../../layers/studio/server/api/presentations/[slug]/unlock.post')
const { default: unlockByAlias } = await import('../../layers/studio/server/api/p/[alias]/unlock.post')

let storedHash: string
beforeEach(async () => {
  storedHash = await hashAccessPassword('open-sesame')
  await useDbContent().writer.save({ slug: 'talk', raw: '---\ntitle: Talk\n---\n\n# Talk', actor: 'test', accessFromText: true })
  await useDeckMeta().update('talk', { title: 'Talk', status: 'semi-private', alias: 'talk-2026', accessPasswordHash: storedHash })
})

describe('the unlock routes', () => {
  it('set the cookie of the deck for the password posted to the slug or to the alias', async () => {
    for (const [unlock, params] of [[unlockBySlug, { slug: 'talk' }], [unlockByAlias, { alias: 'talk-2026' }]] as const) {
      const event = anon({ params, body: { password: 'open-sesame' } })
      await expect(unlock(event)).resolves.toEqual({ unlocked: true })
      expect(verifyAccessPass(event.setCookies?.access_talk, 'talk', storedHash)).toBe(true)
    }
  })

  it('refuse a wrong password, and answer 404 for a deck that does not exist or was never published', async () => {
    await expect(unlockBySlug(anon({ params: { slug: 'talk' }, body: { password: 'nope' } }))).rejects.toMatchObject({ statusCode: 401 })
    await expect(unlockByAlias(anon({ params: { alias: 'nothing' }, body: { password: 'open-sesame' } }))).rejects.toMatchObject({ statusCode: 404 })
    await useDeckMeta().update('unpublished', { status: 'semi-private', alias: 'unpublished-alias', accessPasswordHash: storedHash })
    await expect(unlockBySlug(anon({ params: { slug: 'unpublished' }, body: { password: 'nope' } }))).rejects.toMatchObject({ statusCode: 404 })
    await expect(unlockByAlias(anon({ params: { alias: 'unpublished-alias' }, body: { password: 'nope' } }))).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('a password hashed with the former parameters', () => {
  it('opens the deck, and is hashed again with the current ones', async () => {
    const salt = randomBytes(16).toString('hex')
    const former = `${salt}:${scryptSync('open-sesame', salt, 64).toString('hex')}`
    await useDeckMeta().update('talk', { accessPasswordHash: former })

    const event = anon({ params: { slug: 'talk' }, body: { password: 'open-sesame' } })
    await expect(unlockBySlug(event)).resolves.toEqual({ unlocked: true })
    const rehashed = (await useDeckMeta().get('talk'))!.accessPasswordHash!
    expect(rehashed).toMatch(/^scrypt\$14\$8\$5\$/)
    expect(verifyAccessPass(event.setCookies?.access_talk, 'talk', rehashed)).toBe(true)
    await expect(unlockBySlug(anon({ params: { slug: 'talk' }, body: { password: 'open-sesame' } }))).resolves.toEqual({ unlocked: true })
  })

  it('signs the hash another unlock wrote first, when both replace the former one', async () => {
    const salt = randomBytes(16).toString('hex')
    await useDeckMeta().update('talk', { accessPasswordHash: `${salt}:${scryptSync('open-sesame', salt, 64).toString('hex')}` })
    const first = await hashAccessPassword('open-sesame')
    const store = useDeckMeta()
    const replace = store.replacePasswordHash.bind(store)
    vi.spyOn(store, 'replacePasswordHash').mockImplementationOnce(async (slug, from) => {
      await replace(slug, from, first)
      return false
    })

    const event = anon({ params: { slug: 'talk' }, body: { password: 'open-sesame' } })
    await expect(unlockBySlug(event)).resolves.toEqual({ unlocked: true })
    expect((await useDeckMeta().get('talk'))!.accessPasswordHash).toBe(first)
    expect(verifyAccessPass(event.setCookies?.access_talk, 'talk', first)).toBe(true)
    vi.restoreAllMocks()
  })
})
