import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

// The server of `playwright.config.ts` whose telemetry services are these hosts.
const STUDIO = 'http://app.localhost:3211'
const DECKS = 'http://decks.localhost:3211'
const UMAMI = 'https://stats.test'
const DECK_TITLE = 'Composants'
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' }

interface SentPageView {
  payload: { website: string, url: string, title: string, referrer: string }
}

async function collectPageViews(page: Page): Promise<SentPageView[]> {
  const sent: SentPageView[] = []
  await page.route(`${UMAMI}/api/send`, (route) => {
    if (route.request().method() === 'POST')
      sent.push(route.request().postDataJSON())
    return route.fulfill({ status: 200, headers: CORS, json: {} })
  })
  return sent
}

function pushRoute(page: Page, path: string) {
  return page.evaluate((path) => {
    const app = (document.querySelector('#__nuxt') as unknown as { __vue_app__: { config: { globalProperties: { $router: { push: (to: string) => Promise<unknown> } } } } }).__vue_app__
    return app.config.globalProperties.$router.push(path).then(() => undefined)
  }, path)
}

test('a public deck sends one page view, without its query', async ({ page }) => {
  const sent = await collectPageViews(page)
  await page.goto(`${DECKS}/slides/composants?utm=secret#/1`)
  await expect(page.locator('.reveal')).toHaveClass(/\bready\b/)
  await expect.poll(() => sent.length).toBe(1)
  expect(sent[0]!.payload).toMatchObject({ website: 'decks-website', url: '/slides/composants', title: DECK_TITLE })
  expect(JSON.stringify(sent[0])).not.toContain('secret')
})

test('a navigation in the page to a public deck sends its page view', async ({ page }) => {
  const sent = await collectPageViews(page)
  await page.goto(`${DECKS}/slides/composants`)
  await expect(page.locator('.reveal')).toHaveClass(/\bready\b/)
  await expect.poll(() => sent.length).toBe(1)
  await pushRoute(page, '/slides/cadres')
  await expect.poll(() => sent.map(view => view.payload.url)).toEqual(['/slides/composants', '/slides/cadres'])
})

test('a deck protected by a password sends no page view', async ({ page }) => {
  const sent = await collectPageViews(page)
  await page.goto(`${DECKS}/slides/composants`)
  await expect(page.locator('.reveal')).toHaveClass(/\bready\b/)
  await expect.poll(() => sent.length).toBe(1)
  const status = await page.evaluate(() => fetch('/api/presentations/protege/unlock', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: 'e2e-password' }),
  }).then(response => response.status))
  expect(status).toBe(200)
  await page.goto(`${DECKS}/slides/protege`)
  await expect(page.locator('.reveal')).toHaveClass(/\bready\b/)
  await page.waitForLoadState('networkidle')
  expect(sent).toHaveLength(1)
})

test('a page of the studio sends its template once', async ({ page }) => {
  const sent = await collectPageViews(page)
  await page.goto(`${STUDIO}/login`)
  await expect(page.locator('.tailwind-app')).toBeVisible()
  await expect.poll(() => sent.length).toBe(1)
  await page.waitForLoadState('networkidle')
  expect(sent).toHaveLength(1)
  expect(sent[0]!.payload).toMatchObject({ website: 'studio-website', url: '/login', title: '/login', referrer: '' })
})

test('the referrer of another site goes with the first page view alone', async ({ page }) => {
  const sent = await collectPageViews(page)
  await page.goto(`${STUDIO}/login`, { referer: 'https://other.test/article?id=secret' })
  await expect(page.locator('.tailwind-app')).toBeVisible()
  await expect.poll(() => sent.length).toBe(1)
  await pushRoute(page, '/confidentialite')
  await expect.poll(() => sent.map(view => view.payload.referrer)).toEqual(['https://other.test', ''])
})

test('a navigation inside a page sends no page view', async ({ page }) => {
  const sent = await collectPageViews(page)
  await page.goto(`${STUDIO}/login`)
  await expect(page.locator('.tailwind-app')).toBeVisible()
  await expect.poll(() => sent.length).toBe(1)
  await pushRoute(page, '/login#top')
  await pushRoute(page, '/confidentialite')
  await expect.poll(() => sent.map(view => view.payload.url)).toEqual(['/login', '/confidentialite'])
})

test('the privacy page states the retention period an instance sets', async ({ page }) => {
  await collectPageViews(page)
  await page.goto(`${STUDIO}/confidentialite`)
  await expect(page.getByText(/25 (mois|months)/)).toBeVisible()
  await expect(page.getByText(/\d+ (jours?|days?)/)).toHaveCount(0)
})

test('an error of a page reaches the error tracker without the query of the page', async ({ page }) => {
  await collectPageViews(page)
  const envelopes: string[] = []
  await page.route('https://errors.test/api/1/envelope/**', (route) => {
    envelopes.push(route.request().postData() ?? '')
    return route.fulfill({ status: 200, headers: CORS, json: {} })
  })
  await page.goto(`${DECKS}/slides/composants?ticket=secret`)
  await expect(page.locator('.reveal')).toHaveClass(/\bready\b/)
  await page.evaluate(() => {
    setTimeout(() => {
      throw new Error('telemetry probe')
    })
  })
  await expect.poll(() => envelopes.find(envelope => envelope.includes('telemetry probe'))).toBeDefined()
  const envelope = envelopes.find(envelope => envelope.includes('telemetry probe'))!
  expect(envelope).not.toContain('secret')
  expect(envelope).not.toContain('"breadcrumbs":[{')
})
