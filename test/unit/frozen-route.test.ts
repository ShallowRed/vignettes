import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { useDbContent, useDeckMeta } from '../../layers/studio/server/utils/sources'
import { anon, setupServerDb, stubH3Globals } from './helpers/server-db'

// The route serves a bundle from `.frozen/` under the working directory, behind
// the view gate of the deck the bundle belongs to.
stubH3Globals()
// The address nuxt-og-image would build, with the page and the props of the image.
vi.stubGlobal('getOgImageUrl', (_e: unknown, path: string, options: any) => `https://app.example/_og${path}/${options.component}/${options.props.title}.png`)
setupServerDb()
process.env.NUXT_SESSION_PASSWORD = 'frozen-test-password-with-32-characters'

const { default: serveFrozen } = await import('../../layers/studio/server/routes/frozen/[...path]')

const cwd = process.cwd()
const workdir = mkdtempSync(join(tmpdir(), 'frozen-'))
beforeAll(() => {
  mkdirSync(join(workdir, '.frozen', 'talk-2026'), { recursive: true })
  writeFileSync(join(workdir, '.frozen', 'talk-2026', 'index.html'), '<head><title>Talk</title></head><h1>talk</h1>')
  mkdirSync(join(workdir, '.frozen', 'notes-2026'))
  writeFileSync(join(workdir, '.frozen', 'notes-2026', 'index.html'), '<h1>notes</h1>')
  mkdirSync(join(workdir, '.data'))
  writeFileSync(join(workdir, '.data', 'slides.db'), 'accounts')
  writeFileSync(join(workdir, 'package.json'), '{}')
  process.chdir(workdir)
})
afterAll(() => {
  process.chdir(cwd)
  rmSync(workdir, { recursive: true, force: true })
})

const page = () => serveFrozen(anon({ params: { path: 'talk-2026/' } }))

async function publishedDeck(status: 'public' | 'private') {
  await useDbContent().writer.save({ slug: 'talk', raw: '---\ntitle: Talk\n---\n\n# Talk', actor: 'test', accessFromText: true })
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

  it('gives the page of a public bundle the preview image of its title slide', async () => {
    await publishedDeck('public')
    await useDeckMeta().update('talk', { frozenBundle: 'talk-2026' })
    const html = String(await page())
    expect(html).toContain('<meta property="og:image" content="https://app.example/_og/p/talk/Deck/Talk.png">')
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">')
    expect(html.indexOf('og:image')).toBeLessThan(html.indexOf('</head>'))
  })

  it('ignores a password given on a bundle file', async () => {
    await publishedDeck('public')
    await useDeckMeta().update('talk', { status: 'semi-private', frozenBundle: 'talk-2026', accessPasswordHash: `${'0'.repeat(32)}:${'0'.repeat(128)}` })
    const event = anon({ params: { path: 'talk-2026/' }, query: { password: 'anything' } })
    await expect(serveFrozen(event)).rejects.toMatchObject({ statusCode: 401 })
    expect(event.setCookies).toBeUndefined()
  })
})

describe('the frozen bundle route, on a path out of its bundle', () => {
  it('answers 404 on "..%2F" in the bundle segment, even with ".." stored as the bundle', async () => {
    await publishedDeck('public')
    await useDeckMeta().update('talk', { frozenBundle: '..' })
    await expect(serveFrozen(anon({ params: { path: '..%2F.data%2Fslides.db' } }))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('answers 404 on "..%2F" after the bundle segment', async () => {
    await publishedDeck('public')
    await useDeckMeta().update('talk', { frozenBundle: 'talk-2026' })
    await expect(serveFrozen(anon({ params: { path: 'talk-2026/..%2F..%2F.data%2Fslides.db' } }))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('gates a name on the deck whose bundle it reads, when it is also the alias of another deck', async () => {
    await useDbContent().writer.save({ slug: 'notes', raw: '---\ntitle: Notes\n---\n\n# Notes', actor: 'test', accessFromText: true })
    await useDeckMeta().update('notes', { status: 'private', lifecycle: 'frozen', alias: 'notes', frozenBundle: 'notes-2026' })
    // A public deck whose alias spells the bundle of the private one.
    await publishedDeck('public')
    await useDeckMeta().update('talk', { alias: 'notes-2026', frozenBundle: 'talk-2026' })

    await expect(serveFrozen(anon({ params: { path: 'notes-2026/' } }))).rejects.toMatchObject({ statusCode: 401 })
  })
})
