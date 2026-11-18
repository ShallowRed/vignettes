import { expect, test } from '@playwright/test'

// What a reader sees when a page fails: a slide whose component throws, and the
// page of an address the instance does not know.

// A deck whose second slide writes an icon without its name, which throws
// while the icon renders.
const DECK = '/slides/composant-en-faute'

test('a deck draws a slide without its component that throws, and the slides after it', async ({ page }) => {
  await page.goto(`${DECK}#/une-icone-sans-nom`)
  await expect(page.locator('.reveal')).toHaveClass(/\bready\b/)
  const slide = page.locator('.reveal .slides section.present')
  await expect(slide).toContainText('Une icône sans nom puis la suite')
  await expect(slide.locator('.inline-icon')).toHaveCount(1)

  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.reveal .slides section.present')).toContainText('Le texte de la diapositive suivante.')
})

test('the page of an unknown address draws the header and its link to the home page', async ({ page }) => {
  const errors: Error[] = []
  page.on('pageerror', error => errors.push(error))
  const response = await page.goto('/slides/codimd/adresse-inconnue')
  expect(response?.status()).toBe(404)
  const home = page.getByRole('banner').locator('a[href="/"]')
  // The tooltip opens once the page hydrates.
  await expect(async () => {
    await page.mouse.move(0, 0)
    await home.hover()
    await expect(home).toHaveAttribute('data-state', /open/, { timeout: 500 })
  }).toPass()
  expect(errors).toEqual([])
})
