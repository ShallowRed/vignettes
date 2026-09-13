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

test('the deck lifts its loading veil once Reveal is ready', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(DECK)

  // The veil lifts after 4 seconds without a ready signal, so 3 seconds proves the signal.
  await expect(page.locator('.deck-veil')).toBeHidden({ timeout: 3000 })
  await expect(page.locator('.reveal')).toHaveClass(/\bready\b/)
  expect(errors).toEqual([])
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
    'Iframe': ['.iframe-container iframe', 1],
    'PreviewLink': ['a.preview-link', 1],
    'Mermaid': ['.mermaid-container > svg', 1],
    'Scheme and Step': ['.scheme .picto-card', 2],
    'Diagram and Node': ['.diagram .picto-card', 2],
    'Area': ['.diagram-area', 1],
    'Tags': ['.tags', 1],
    'JsonTour and Zone': ['.json-tour .json-tour-zone', 1],
    'RuleCard': ['.rule-card', 1],
    'Screens and StoryFrame': ['.screens .story-frame', 2],
    'FullScreenImage': ['.full-screen-image', 1],
    'pretitle': ['.slide-pretitle', 1],
    'layout': ['.slide-media-pane', 1],
    'quicklink': ['a:has-text("Retour au catalogue")', 1],
    'slide-background': ['section[data-background-image="/images/placeholder.svg"]', 1],
  }
  for (const [name, [selector, count]] of Object.entries(rendered))
    await expect.soft(slides.locator(selector), name).toHaveCount(count)

  await expect.soft(slides.locator('aside.notes'), 'Notes stay out of the slide').toBeHidden()
})
