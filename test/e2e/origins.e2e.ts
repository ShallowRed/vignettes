import type { APIRequestContext } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import JSZip from 'jszip'

// The server of `playwright.config.ts` that serves the decks apart from the studio.
const STUDIO = 'http://app.localhost:3211'
const DECKS = 'http://decks.localhost:3211'
const DECK = '/slides/composants'

// A request from Node reaches the loopback by its address and names the host in
// a header: the resolver of the system may not know `*.localhost`.
function send(request: APIRequestContext, method: 'GET' | 'POST', host: string, path: string) {
  return request.fetch(`http://127.0.0.1:3211${path}`, { method, headers: { host: `${host}:3211` }, maxRedirects: 0 })
}

test('a deck page opened on the studio loads on the deck origin', async ({ page }) => {
  await page.goto(`${STUDIO}${DECK}`)
  await expect(page).toHaveURL(`${DECKS}${DECK}`)
  await expect(page.locator('.reveal')).toHaveClass(/\bready\b/)
})

test('the sign-in command of a deck opens the login page of the studio', async ({ page }) => {
  await page.goto(`${DECKS}${DECK}`)
  await expect(page.locator('.reveal.ready')).toHaveCount(1)
  const login = await page.locator('.deck-control[href^="/login"]').getAttribute('href')
  await page.goto(`${DECKS}${login}`)
  // The redirect is read decoded: the server of the trials encodes it otherwise.
  await expect(page).toHaveURL(url => url.origin === STUDIO && url.pathname === '/login' && url.searchParams.get('redirect') === `${DECK}#/0/0`)
  await expect(page.locator('.tailwind-app')).toBeVisible()
})

test('a link of the studio to a deck page leaves for the deck origin', async ({ page }) => {
  await page.goto(`${STUDIO}/login`)
  await expect(page.locator('.tailwind-app')).toBeVisible()
  // No page of the studio links to a deck for a visitor without a session: the
  // test pushes the route through the router of the page.
  await page.evaluate((path) => {
    const app = (document.querySelector('#__nuxt') as unknown as { __vue_app__: { config: { globalProperties: { $router: { push: (to: string) => unknown } } } } }).__vue_app__
    return app.config.globalProperties.$router.push(path)
  }, DECK)
  await expect(page).toHaveURL(`${DECKS}${DECK}`)
  await expect(page.locator('.reveal')).toHaveClass(/\bready\b/)
})

test('the deck origin sends a read of the studio to the studio and refuses a write', async ({ request }) => {
  const read = await send(request, 'GET', 'decks.localhost', '/')
  expect(read.status()).toBe(302)
  expect(read.headers().location).toBe(`${STUDIO}/`)
  expect((await send(request, 'POST', 'decks.localhost', '/api/presentations')).status()).toBe(404)
})

test('another address sends a read to the studio for good and refuses a write', async ({ request }) => {
  const read = await send(request, 'GET', 'other.localhost', DECK)
  expect(read.status()).toBe(301)
  expect(read.headers().location).toBe(`${STUDIO}${DECK}`)
  expect((await send(request, 'POST', 'other.localhost', '/api/presentations')).status()).toBe(404)
})

test('the deck origin sets no session cookie of the studio', async ({ page }) => {
  await page.goto(`${DECKS}${DECK}`)
  await expect(page.locator('.reveal.ready')).toHaveCount(1)
  await page.evaluate(() => fetch('/api/_auth/session'))
  const names = (await page.context().cookies(DECKS)).map(cookie => cookie.name)
  expect(names).not.toContain('nuxt-session')
})

test('the PowerPoint command, on trial, downloads a file with a slide per slide of the deck', async ({ page }) => {
  await page.goto(`${DECKS}${DECK}`)
  await expect(page.locator('.reveal.ready')).toHaveCount(1)
  await expect(page.locator('.deck-veil')).toBeHidden()
  const slides = await page.locator('.reveal .slides section:not(.stack)').count()

  await page.locator('.deck-controls').hover()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exporter en PowerPoint' }).click()
  const file = await download

  expect(file.suggestedFilename()).toBe('composants.pptx')
  const zip = await JSZip.loadAsync(await readFile((await file.path())!))
  expect(Object.keys(zip.files).filter(path => /^ppt\/slides\/slide\d+\.xml$/.test(path))).toHaveLength(slides)
  expect(await zip.file('ppt/slides/slide1.xml')!.async('string')).toContain('<a:t>Composants</a:t>')
})
