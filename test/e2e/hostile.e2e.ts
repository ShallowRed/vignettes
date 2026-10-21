import { expect, test } from '@playwright/test'

// A deck written to run a script in the studio page: every payload calls
// `alert`, so a dialog proves one of them ran.
const DECK = '/slides/hostile'

test('a hostile deck runs no script in the studio page', async ({ page }) => {
  const dialogs: string[] = []
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.message())
    await dialog.dismiss()
  })
  await page.goto(DECK)
  await expect(page.locator('.reveal')).toHaveClass(/\bready\b/)

  for (let slide = 0; slide < 5; slide++) {
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(300)
  }
  await page.locator('.reveal [data-preview-link]').first().click({ timeout: 1000 }).catch(() => {})
  await page.waitForTimeout(500)

  expect(dialogs).toEqual([])
  const addresses = await page.locator('.reveal').evaluate(root => [...root.querySelectorAll('*')]
    .flatMap(element => [...element.attributes])
    .filter(attribute => /^(?:href|src|data-src|data-preview-link)$/.test(attribute.name))
    .map(attribute => attribute.value)
    .filter(value => !/^(?:https?:|[/#.]|$)/i.test(value)))
  expect(addresses).toEqual([])
})

test('every frame of a deck is sandboxed, and an uploaded file loses its origin', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'The attributes do not depend on the browser.')
  await page.goto(DECK)
  await expect(page.locator('.reveal')).toHaveClass(/\bready\b/)
  const frames = await page.locator('.reveal iframe').evaluateAll(iframes => iframes.map(iframe => ({
    src: iframe.getAttribute('src') ?? iframe.getAttribute('data-src'),
    sandbox: iframe.getAttribute('sandbox'),
    referrer: iframe.getAttribute('referrerpolicy'),
  })))
  expect(frames.length).toBeGreaterThan(0)
  for (const frame of frames) {
    expect(frame.sandbox, String(frame.src)).toContain('allow-scripts')
    expect(frame.referrer).toBe('strict-origin-when-cross-origin')
  }
  expect(frames.find(frame => frame.src === '/slides/composants')?.sandbox).toContain('allow-same-origin')
  await page.goto(`${DECK}#/liens`)
  await expect(page.frameLocator('iframe[src="/slides/composants"]').locator('.reveal')).toHaveClass(/\bready\b/)
  expect(frames.find(frame => frame.src === '/media/hostile.svg')?.sandbox).not.toContain('allow-same-origin')
})
