import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { OVERFLOW_THRESHOLD, sectionOverflow } from '../../layers/studio/src/utils/preview-overflow'
import { LAYOUT_DECKS } from './fixtures/layout-decks'

/** The overflow of the slide at `h`, measured in the page by the editor's own function. */
async function overflowAt(page: Page, deck: string, h: number): Promise<number> {
  await page.goto(`${deck}#/${h}`)
  await expect(page.locator('.reveal.ready')).toHaveCount(1)
  await page.evaluate(() => document.fonts.ready)
  return page.evaluate(`(${sectionOverflow.toString()})(
    document.querySelector('.reveal .slides'),
    document.querySelector('.reveal .slides section.present:not(.stack)'),
    document.querySelector('.reveal .slides').offsetHeight,
  )`)
}

for (const deck of LAYOUT_DECKS) {
  test(`the overflow counts the text past the slide and the text that reaches a media below it, in ${deck}`, async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'The measure reads the geometry of the theme stylesheet; Chromium is enough to keep its rule.')
    const fits = (overflow: number) => overflow <= OVERFLOW_THRESHOLD
    expect(fits(await overflowAt(page, deck, 1)), 'a slide without a media').toBe(true)
    expect(fits(await overflowAt(page, deck, 2)), 'a short text beside a media').toBe(true)
    expect(fits(await overflowAt(page, deck, 3)), 'a long text beside a media at 3/4').toBe(false)
    expect(fits(await overflowAt(page, deck, 4)), 'a text above a media at 3/4 of the height').toBe(false)
    expect(fits(await overflowAt(page, deck, 5)), 'a short text over an image behind a veil').toBe(true)
  })
}
