import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { useDbContent, useDeckMeta } from '../../layers/studio/server/utils/sources'
import { anon, setupServerDb, stubH3Globals } from './helpers/server-db'

// The route serves a bundle from `.frozen/` under the working directory, behind
// the view gate of the deck the bundle belongs to.
stubH3Globals()
setupServerDb()
process.env.NUXT_SESSION_PASSWORD = 'frozen-test-password-with-32-characters'

const { default: serveFrozen } = await import('../../layers/studio/server/routes/frozen/[...path]')

const cwd = process.cwd()
const workdir = mkdtempSync(join(tmpdir(), 'frozen-'))
beforeAll(() => {
  mkdirSync(join(workdir, '.frozen', 'talk-2026'), { recursive: true })
  writeFileSync(join(workdir, '.frozen', 'talk-2026', 'index.html'), '<h1>talk</h1>')
  process.chdir(workdir)
})
afterAll(() => {
  process.chdir(cwd)
  rmSync(workdir, { recursive: true, force: true })
})

const page = () => serveFrozen(anon({ params: { path: 'talk-2026/' } }))

async function publishedDeck(status: 'public' | 'private') {
  await useDbContent().writer.save({ slug: 'talk', raw: '---\ntitle: Talk\n---\n\n# Talk', actor: 'test' })
  // A frozen deck is reached through `/p/<alias>`, so it always carries one.
  await useDeckMeta().update('talk', { status, lifecycle: 'frozen', alias: 'talk' })
}

describe('the frozen bundle route', () => {
  it('answers 404 for a bundle no deck declares, then serves it once one does', async () => {
    await publishedDeck('public')
    await expect(page()).rejects.toMatchObject({ statusCode: 404 })

    await useDeckMeta().update('talk', { frozenBundle: 'talk-2026' })

    await expect(page()).resolves.toBeDefined()
  })

  it('closes the bundle as soon as its deck is closed, and reopens it with it', async () => {
    await publishedDeck('public')
    await useDeckMeta().update('talk', { frozenBundle: 'talk-2026' })
    await expect(page()).resolves.toBeDefined()

    await useDeckMeta().update('talk', { status: 'private' })
    await expect(page()).rejects.toMatchObject({ statusCode: 401 })

    await useDeckMeta().update('talk', { status: 'public' })
    await expect(page()).resolves.toBeDefined()
  })

  it('ignores a password given on a bundle file', async () => {
    await publishedDeck('public')
    await useDeckMeta().update('talk', { status: 'semi-private', frozenBundle: 'talk-2026', accessPasswordHash: `${'0'.repeat(32)}:${'0'.repeat(128)}` })
    const event = anon({ params: { path: 'talk-2026/' }, query: { password: 'anything' } })
    await expect(serveFrozen(event)).rejects.toMatchObject({ statusCode: 401 })
    expect(event.setCookies).toBeUndefined()
  })
})
