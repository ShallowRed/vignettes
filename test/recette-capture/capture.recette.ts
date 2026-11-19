import type { Page } from '@playwright/test'
import type { RecetteQuestion } from '../../layers/studio/shared/recette/branch'
import type { RecetteWidth } from '../../layers/studio/shared/recette/captures'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { captureKey, RECETTE_CAPTURE_DIR } from '../../layers/studio/shared/recette/captures'
import { fetchBranchRecette, OWNER_STATE, readPlan, recordTaken } from './setup'

/**
 * One test per question of the branch recette, at each width: it opens the page
 * of the question as its account, plays its gestures and writes the capture
 * that `/recette/branche` shows beside the question.
 */

test.use({ storageState: OWNER_STATE })

/** The tools of the dev server, which the studio of staging and production does not show. */
const DEV_ONLY = '#nuxt-devtools-container, nuxt-devtools-inspect-panel, #vue-tracer-overlay { display: none !important; }'

/** Opens the app as `account`, by the route the « Ouvrir la page » button of the recette page posts to. */
async function openAs(page: Page, account: string, redirect: string): Promise<void> {
  await page.goto('/')
  await page.evaluate(async ({ account, redirect }) => {
    // The session changes with the redirect, whatever the page it leads to answers.
    const answer = await fetch('/auth/recette', { method: 'POST', body: new URLSearchParams({ as: account, redirect }), redirect: 'manual' })
    if (answer.type !== 'opaqueredirect')
      throw new Error(`POST /auth/recette as ${account}: ${answer.status}`)
  }, { account, redirect })
  await page.goto(redirect)
}

/** Waits for the page to show its content: the fonts and images, a deck ready, an editor that received its text. */
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('load')
  await page.evaluate(() => document.fonts.ready)
  // A lazy image outside the window loads only once scrolled to.
  await page.waitForFunction(() => [...document.images].every(image => image.loading === 'lazy' || image.complete))
  if (await page.locator('.reveal').count())
    await expect(page.locator('.reveal').first()).toHaveClass(/\bready\b/)
  if (new URL(page.url()).pathname.startsWith('/edit/')) {
    await page.locator('.cm-content').first().waitFor()
    await page.waitForFunction(() => {
      const header = document.querySelector('[data-collab-status]')
      return !header || header.getAttribute('data-collab-status') === 'connected'
    })
  }
}

async function play(page: Page, steps: NonNullable<RecetteQuestion['steps']>): Promise<void> {
  for (const step of steps) {
    if ('click' in step) {
      const target = 'text' in step.click
        ? page.getByText(step.click.text, { exact: true })
        : page.getByRole(step.click.role as Parameters<Page['getByRole']>[0], { name: step.click.name, exact: true })
      await target.click()
    }
    else if ('press' in step) {
      for (let count = 0; count < (step.repeat ?? 1); count++)
        await page.keyboard.press(step.press)
    }
    else {
      await page.keyboard.type(step.type)
    }
  }
}

for (const question of readPlan().questions) {
  test(`${question.subject} › ${question.id}`, async ({ page }, info) => {
    const width = info.project.name as RecetteWidth
    // A gesture may write in a trial deck: the question starts from their files and leaves them so.
    if (question.steps?.length) {
      await page.goto('/')
      await fetchBranchRecette(page, { publish: true })
    }
    await openAs(page, question.account, question.page)
    await settle(page)
    await play(page, question.steps ?? [])
    // A page answers a gesture after its own delays, such as the editor preview
    // that follows the caret: the capture waits for them to pass.
    if (question.steps?.length)
      await page.waitForTimeout(1_500)
    const key = captureKey(question.subject, question.id, width)
    await page.screenshot({ path: join(RECETTE_CAPTURE_DIR, key), fullPage: question.full, animations: 'disabled', style: DEV_ONLY })
    recordTaken(key)
    if (question.steps?.length)
      await fetchBranchRecette(page, { publish: true })
  })
}
