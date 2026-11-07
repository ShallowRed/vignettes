import { expect, test } from '@playwright/test'

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
