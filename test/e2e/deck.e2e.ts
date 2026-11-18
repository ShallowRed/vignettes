import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

const DECK = '/slides/composants'

test('the server-rendered page links the Reveal styles and the theme', async ({ request, browserName }) => {
  test.skip(browserName !== 'chromium', 'The response does not depend on the browser.')
  const html = await (await request.get(DECK)).text()

  expect(html).toMatch(/<link[^>]+href="\/themes\/[^"]+\.css"[^>]*data-deck-theme/)
  const stylesheets = [...html.matchAll(/<link rel="stylesheet" href="(\/_nuxt\/[^"]+\.css)"/g)].map(m => m[1])
  const css = await Promise.all(stylesheets.map(async href => (await request.get(href)).text()))
  expect(css.some(sheet => sheet.includes('.reveal .slides'))).toBe(true)
})

test('the build serves the iframe scaler of @vignettes/storybook', async ({ request, browserName }) => {
  test.skip(browserName !== 'chromium', 'The response does not depend on the browser.')
  const response = await request.get('/scaled-frame.js')

  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toMatch(/javascript/)
})

test('the deck lifts its loading veil once Reveal is ready', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(DECK)

  // The veil lifts after 4 seconds without a ready signal, so 3 seconds proves the signal.
  await expect(page.locator('.deck-veil')).toBeHidden({ timeout: 3000 })
  await expect(page.locator('.reveal')).toHaveClass(/\bready\b/)
  expect(errors).toEqual([])
})

test('a visitor without a session gets a sign-in command that returns to the current slide', async ({ page }) => {
  await page.goto(`${DECK}#/1`)
  await expect(page.locator('.reveal.ready')).toHaveCount(1)

  await expect(page.locator('.deck-control[href^="/login"]'))
    .toHaveAttribute('href', `/login?redirect=${encodeURIComponent(`${DECK}#/1/0`)}`)
})

test('a deck without `reveal:` takes the slide size of its theme manifest', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'The slide size does not depend on the browser.')
  await page.goto(DECK)
  await expect(page.locator('.reveal')).toHaveClass(/\bready\b/)
  // The size declared by themes/dsfr/theme.json.
  await expect(page.locator('.reveal .slides')).toHaveCSS('width', '1200px')
  await expect(page.locator('.reveal .slides')).toHaveCSS('height', '800px')
})

test('every authoring component renders its own markup', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Component rendering does not depend on the browser.')
  await page.goto(DECK)
  await expect(page.locator('.reveal')).toHaveClass(/\bready\b/)
  const slides = page.locator('.reveal .slides')

  // A component that does not resolve stays in the page as an element HTML does not know.
  const unresolved = await slides.evaluate(root => [...root.querySelectorAll('*')]
    .filter(element => element instanceof HTMLUnknownElement)
    .map(element => element.localName))
  expect(unresolved).toEqual([])

  const rendered: Record<string, [selector: string, count: number]> = {
    'Quote': ['blockquote.quote', 1],
    'Highlight': ['.highlight', 1],
    'IconInline': ['.inline-icon', 1],
    'Columns': ['.columns', 1],
    'Fragments': ['.fragments .fragment', 2],
    'Notes': ['aside.notes', 1],
    'Image': ['figure.image-figure img', 1],
    'Image caption': ['figure.image-figure figcaption', 1],
    'Iframe': ['.iframe-container iframe', 1],
    'Mermaid': ['.mermaid-container > svg', 1],
    'Scheme and Step': ['.scheme .picto-card', 2],
    'Diagram and Node': ['.diagram .picto-card', 2],
    'Area': ['.diagram-area', 1],
    'Sequence and Actor': ['.sequence .sequence-actor .picto-card', 3],
    'entry of a participant with its first row': ['.sequence .sequence-actor.fragment[data-fragment-index="2"]', 1],
    'Message, State and Remark': ['.sequence .sequence-row', 3],
    'JsonTour and Zone': ['.json-tour .json-tour-zone', 1],
    'Screens and StoryFrame': ['.screens .story-frame', 2],
    'FullScreenImage of the earlier format': ['section.layout-media-behind[data-background-image="/favicon.svg"]', 1],
    'media behind the text': ['section.layout-media-behind.media-veil[data-background-image="/images/placeholder-dark.svg"]', 1],
    'description of a media behind the text': ['[role="img"][aria-label="Image de démonstration"]', 1],
    'pretitle': ['.slide-pretitle', 1],
    'layout': ['.slide-media-pane', 1],
    'quicklink': ['a:has-text("Retour au catalogue")', 1],
    'slide-background': ['section[data-background-image="/images/placeholder.svg"]', 1],
  }
  for (const [name, [selector, count]] of Object.entries(rendered))
    await expect.soft(slides.locator(selector), name).toHaveCount(count)

  await expect.soft(slides.locator('aside.notes'), 'Notes stay out of the slide').toBeHidden()
})

test('the items of a collapsed Fragments take no space before their step', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'The layout does not depend on the browser.')
  await page.goto(DECK)
  await expect(page.locator('.reveal')).toHaveClass(/\bready\b/)

  await expect(page.locator('.reveal .fragments--collapse .fragment').first()).toHaveCSS('display', 'none')
})

test('the deck page sends the security headers', async ({ request, browserName }) => {
  test.skip(browserName !== 'chromium', 'The response does not depend on the browser.')
  const headers = (await request.get(DECK)).headers()

  expect(headers['content-security-policy']).toContain('frame-ancestors \'self\'')
  expect(headers['content-security-policy']).toMatch(/script-src 'self' 'nonce-[^']+'/)
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['x-powered-by']).toBeUndefined()
})

test('every component renders within the policy of the page', async ({ page }) => {
  await page.addInitScript(() => {
    const reports: string[] = ((window as any).__violations = [])
    document.addEventListener('securitypolicyviolation', event =>
      reports.push(`${event.violatedDirective} ${event.blockedURI}`))
  })
  await page.goto(DECK)
  await expect(page.locator('.reveal')).toHaveClass(/\bready\b/)
  await expect(page.locator('.mermaid-container > svg')).toHaveCount(1)

  expect(await page.evaluate(() => (window as any).__violations as string[])).toEqual([])
})

// The fixture diagram is taller than the slide: drawn at its own size, it
// would pass the bottom of the article.
for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  test(`a Mermaid diagram ends above the bottom of the slide at ${viewport.width} × ${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto(`${DECK}#/mermaid`)
    const svg = page.locator('section#mermaid .mermaid-container > svg')
    await expect(svg).toHaveCount(1)

    await expect.poll(() => svg.evaluate((el) => {
      const section = el.closest('section')!
      const article = el.closest('article')!
      const ratio = section.getBoundingClientRect().height / section.offsetHeight
      const paddings = Number.parseFloat(getComputedStyle(section).paddingBottom) + Number.parseFloat(getComputedStyle(article).paddingBottom)
      return Math.round(section.getBoundingClientRect().bottom - paddings * ratio - el.getBoundingClientRect().bottom)
    })).toBeGreaterThanOrEqual(0)
  })
}

test('the enlarge button opens a Mermaid diagram on a click and on Enter', async ({ page }) => {
  await page.goto(`${DECK}#/mermaid`)
  const button = page.locator('section#mermaid .expand-button')
  const overlay = page.locator('.mermaid-fullscreen-content > svg')
  await expect(page.locator('section#mermaid .mermaid-container > svg')).toHaveCount(1)

  await page.locator('section#mermaid .mermaid-diagram').hover()
  await button.click()
  await expect(overlay).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(overlay).toHaveCount(0)

  await button.focus()
  await page.keyboard.press('Enter')
  await expect(overlay).toBeVisible()
  await page.keyboard.press('Escape')

  await button.focus()
  await page.keyboard.press('Space')
  await expect(overlay).toBeVisible()
  await expect(page).toHaveURL(/#\/mermaid$/)
})

// The page framed on the sixth slide of the fixture deck.
const FRAMES_DECK = '/slides/cadres'
const FRAMED_PAGE = 'http://127.0.0.1:3210/page-integree.html'
async function serveFramedPage(page: Page) {
  const served = { count: 0 }
  await page.route(FRAMED_PAGE, (route) => {
    served.count++
    return route.fulfill({ contentType: 'text/html', body: '<p>Page intégrée</p>' })
  })
  return served
}

test('a frame loads when its slide is shown', async ({ page }) => {
  await serveFramedPage(page)
  await page.goto(FRAMES_DECK)
  await expect(page.locator('.reveal')).toHaveClass(/\bready\b/)
  const frame = page.locator('section#page-integree iframe')
  await expect(frame).not.toHaveAttribute('src')

  await page.evaluate(() => window.location.hash = '#/page-integree')
  await expect(frame).toHaveAttribute('src', FRAMED_PAGE)
})

const FOCUSING_PAGE = 'http://127.0.0.1:3210/page-focus.html'

// A page that focuses its own field once loaded, as a story's `play` function does.
async function openFocusingFrame(page: Page) {
  await page.route(FOCUSING_PAGE, route => route.fulfill({
    contentType: 'text/html',
    body: '<input id="champ"><script>setTimeout(() => { document.getElementById("champ").focus(); window.focused = document.activeElement.id }, 200)</script>',
  }))
  await page.goto(`${FRAMES_DECK}#/page-qui-prend-le-focus`)
  await expect(page.locator('.reveal')).toHaveClass(/\bready\b/)
  const frame = page.locator('section#page-qui-prend-le-focus iframe')
  await expect(frame).toHaveAttribute('src', FOCUSING_PAGE)
  await expect.poll(() => page.frame({ url: FOCUSING_PAGE })?.evaluate(() => (window as any).focused)).toBe('champ')
  return frame
}

test('the keyboard stays on the deck when a frame focuses its page', async ({ page }) => {
  await openFocusingFrame(page)
  await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).not.toBe('IFRAME')

  await page.keyboard.press('ArrowRight')
  await expect(page).toHaveURL(/#\/fin$/)
})

test('a click activates a frame, and a click beside it gives the keyboard back to the deck', async ({ page }) => {
  const frame = await openFocusingFrame(page)
  const box = (await frame.boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await expect(frame).toHaveAttribute('data-frame-active', '')

  await page.locator('section#page-qui-prend-le-focus h2').click()
  await expect(frame).not.toHaveAttribute('data-frame-active')
  await page.keyboard.press('ArrowRight')
  await expect(page).toHaveURL(/#\/fin$/)
})

test('Tab enters a frame and activates it', async ({ page }) => {
  await openFocusingFrame(page)
  // The deck takes back the focus that the frame takes on load. Firefox then
  // starts the keyboard navigation after the frame and does not wrap around
  // the page, so Tab starts from the title of the slide.
  await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).not.toBe('IFRAME')
  await page.locator('section#page-qui-prend-le-focus h2').click()
  // A frame of another origin takes the focus a moment after Tab.
  for (let presses = 0; presses < 20; presses++) {
    await page.keyboard.press('Tab')
    const entered = await page.waitForFunction(() => document.activeElement?.tagName === 'IFRAME', null, { timeout: 1000 }).then(() => true, () => false)
    if (entered)
      break
  }

  await page.waitForTimeout(500)
  expect(await page.evaluate(() => [document.activeElement?.tagName, document.activeElement?.hasAttribute('data-frame-active')])).toEqual(['IFRAME', true])
})

test('the print view opens the dialog once every diagram is drawn', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'The print view opens the dialog in Chromium only.')
  await page.addInitScript(() => {
    window.print = () => {
      (window as any).__pendingAtPrint = document.querySelectorAll('[data-rendering]').length
    }
  })
  await page.goto(`${DECK}?print-pdf`)
  await expect.poll(() => page.evaluate(() => (window as any).__pendingAtPrint)).toBe(0)
})

test.describe('below 435px, where Reveal lays the deck out as a scrolling page', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('a link to a slide opens that slide', async ({ page }) => {
    await page.goto(`${DECK}#/pleine-page`)
    await expect(page.locator('.reveal.reveal-scroll.ready')).toHaveCount(1)

    const slide = page.locator('.slides section#fond')
    await expect(slide).toHaveClass(/\bpresent\b/)
    await expect(slide).toBeInViewport({ ratio: 0.9 })
    await expect(page).toHaveURL(/#\/fond$/)
  })

  for (const [opening, width] of [['at 390px', 390], ['at 1280px, then narrowed to 390px', 1280]] as const) {
    test(`a frame loads once as the page scrolls, with the deck opened ${opening}`, async ({ page }) => {
      const served = await serveFramedPage(page)
      await page.setViewportSize({ width, height: 844 })
      await page.goto(FRAMES_DECK)
      await expect(page.locator('.reveal.ready')).toHaveCount(1)
      await page.setViewportSize({ width: 390, height: 844 })
      await expect(page.locator('.reveal.reveal-scroll')).toHaveCount(1)
      const frame = page.locator('section#page-integree iframe')

      await frame.scrollIntoViewIfNeeded()
      await expect(frame).toHaveAttribute('src', FRAMED_PAGE)
      // Each scroll event makes Reveal sync the pages it loads.
      const viewport = page.locator('.reveal-viewport')
      const bottom = await viewport.evaluate(element => element.scrollTop)
      for (const top of [0, bottom, 0, bottom]) {
        await viewport.evaluate((element, top) => new Promise((resolve) => {
          element.addEventListener('scroll', resolve, { once: true })
          element.scrollTop = top
        }), top)
      }
      await expect(frame).toHaveAttribute('src', FRAMED_PAGE)
      expect(served.count).toBe(1)
    })
  }
})

test('the deck controls hold no PowerPoint command while the export is on trial, closed in production', async ({ page }) => {
  await page.goto(DECK)
  await expect(page.locator('.reveal.ready')).toHaveCount(1)
  await page.locator('.deck-controls').hover()
  await expect(page.getByRole('button', { name: 'Imprimer ou exporter en PDF' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Exporter en PowerPoint' })).toHaveCount(0)
})

test('Reveal answers the messages of the deck origin, and ignores a frame of another origin', async ({ page }) => {
  await page.goto(DECK)
  await expect(page.locator('.deck-veil')).toBeHidden()
  const setState = JSON.stringify({ method: 'setState', args: [{ indexh: 1 }] })

  await page.evaluate(() => {
    const frame = document.createElement('iframe')
    frame.setAttribute('sandbox', 'allow-scripts')
    frame.name = 'foreign'
    document.body.append(frame)
  })
  await page.frame('foreign')!.evaluate(message => parent.postMessage(message, '*'), setState)
  await page.waitForTimeout(300)
  expect(new URL(page.url()).hash).not.toBe('#/1')

  await page.evaluate(message => window.postMessage(message, '*'), setState)
  await expect(page).toHaveURL(/#\/1$/)
})
