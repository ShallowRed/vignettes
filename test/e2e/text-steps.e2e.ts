import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { bodyReading } from '../../layers/studio/src/utils/preview-overflow'
import { LAYOUT_DECKS } from './fixtures/layout-decks'

/** The body of the slide at `h` as the layout panel measures it, by the editor's own function. */
async function readingAt(page: Page, deck: string, h: number): Promise<ReturnType<typeof bodyReading>> {
  await page.goto(`${deck}#/${h}`)
  await expect(page.locator('.reveal.ready')).toHaveCount(1)
  await page.evaluate(() => document.fonts.ready)
  return page.evaluate(`(${bodyReading.toString()})(document.querySelector('.reveal .slides section.present:not(.stack)'))`)
}

/** The computed sizes of the slide at `h`: its body, its heading, its subtitle, in slide pixels. */
async function sizesAt(page: Page, deck: string, h: number) {
  await page.goto(`${deck}#/${h}`)
  await expect(page.locator('.reveal.ready')).toHaveCount(1)
  return page.evaluate(() => {
    const section = document.querySelector('.reveal .slides section.present:not(.stack)')!
    const size = (selector: string) => {
      const element = section.querySelector(selector)
      return element ? Number.parseFloat(getComputedStyle(element).fontSize) : undefined
    }
    const style = getComputedStyle(section)
    return {
      body: size(':scope > .slide-content-pane > article'),
      heading: size(':is(header, hgroup) :is(h2, h3)'),
      subtitle: size('.slide-subtitle'),
      paddingX: Number.parseFloat(style.paddingLeft),
    }
  })
}

for (const deck of LAYOUT_DECKS) {
  test(`the text steps size the body of a slide over the floor of its theme, in ${deck}`, async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'The sizes come from the theme stylesheet; Chromium is enough to keep its rules.')
    const steps = []
    for (let h = 6; h <= 10; h++)
      steps.push(await sizesAt(page, deck, h))
    const [atXs, atSm, atMd, atLg, atXl] = steps

    // Without a step, the body keeps the size of the theme.
    expect(atMd!.body).toBe(24)
    for (const [smaller, larger] of [[atXs, atSm], [atSm, atMd], [atMd, atLg], [atLg, atXl]])
      expect(larger!.body! / smaller!.body!).toBeCloseTo(1.125, 3)
    // The heading and the subtitle keep their size at every step.
    expect(atXs!.heading).toBe(atXl!.heading)
    expect(atXs!.subtitle).toBe(atXl!.subtitle)

    // Beside a media, the shrink of the column and the step multiply over the floor.
    expect((await sizesAt(page, deck, 11)).body).toBeCloseTo(19.2, 1)
    expect((await sizesAt(page, deck, 3)).body).toBeCloseTo(16.32, 1)
    expect((await sizesAt(page, deck, 12)).body).toBe(16)
    expect((await sizesAt(page, deck, 14)).body).toBe(16)

    // The tight inset halves the margins of the slide.
    expect((await sizesAt(page, deck, 13)).paddingX).toBeCloseTo(atMd!.paddingX / 2, 1)
  })

  test(`the layout panel reads the size, the share and the fill of the body, in ${deck}`, async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'The measure reads the geometry of the theme stylesheet; Chromium is enough to keep its rule.')
    const short = await readingAt(page, deck, 8)
    expect(short).toMatchObject({ bodySize: 24, textScale: 1, ratio: 1.125 })
    expect(short.fill).toBeLessThan(0.5)
    expect((await readingAt(page, deck, 3)).fill).toBeGreaterThan(1)
    expect((await readingAt(page, deck, 11)).textScale).toBeCloseTo(0.8, 2)
    // At `xs`, the share is against the body at `xs`, which the theme computes.
    expect((await readingAt(page, deck, 14)).textScale).toBeCloseTo(16 / (24 / 1.125 ** 2), 2)
  })
}

test('the tight inset halves the margins of a slide and the place of its bloc marque', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'The margins come from the theme stylesheet; Chromium is enough to keep its rules.')
  const marginsAt = async (h: number) => {
    await page.goto(`/slides/marque#/${h}`)
    await expect(page.locator('.reveal.ready')).toHaveCount(1)
    return page.evaluate(() => {
      const section = document.querySelector('.reveal .slides section.present:not(.stack)')!
      const brand = section.querySelector<HTMLElement>(':scope > .slide-brand')!
      const style = getComputedStyle(section)
      return { top: Number.parseFloat(style.paddingTop), bottom: Number.parseFloat(style.paddingBottom), brandLeft: brand.offsetLeft, brandTop: brand.offsetTop }
    })
  }
  const theme = await marginsAt(1)
  const tight = await marginsAt(2)
  expect(tight.bottom).toBeCloseTo(theme.bottom / 2, 1)
  expect(tight.top - tight.bottom).toBeCloseTo(theme.top - theme.bottom, 1)
  expect(tight.brandLeft).toBeCloseTo(theme.brandLeft / 2, 1)
  expect(tight.brandTop).toBeCloseTo(theme.brandTop / 2, 1)
})
