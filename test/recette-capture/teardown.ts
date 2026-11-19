import type { FullConfig } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { chromium } from '@playwright/test'
import { captureStateKey, RECETTE_CAPTURE_DIR } from '../../layers/studio/shared/recette/captures'
import { fetchBranchRecette, OWNER_STATE, readPlan, readTaken } from './setup'

/**
 * Writes beside the captures of each subject the state of the worktree and
 * the keys of the captures the run took, which the page compares to tell a
 * stale capture. A worktree that changed during the run writes none, and the
 * run fails.
 */
export default async function teardown(config: FullConfig): Promise<void> {
  const plan = readPlan()
  const use = config.projects[0]?.use ?? {}
  const browser = await chromium.launch(use.launchOptions)
  try {
    const context = await browser.newContext({ baseURL: use.baseURL, ignoreHTTPSErrors: use.ignoreHTTPSErrors, storageState: OWNER_STATE })
    const page = await context.newPage()
    await page.goto('/')
    const { state } = await fetchBranchRecette(page, { publish: false })
    if (state === null || state !== plan.state)
      throw new Error('The worktree changed during the capture: run mise run recette:capture again')
    const taken = readTaken()
    for (const subject of new Set(plan.questions.map(question => question.subject))) {
      const file = join(RECETTE_CAPTURE_DIR, captureStateKey(subject))
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, JSON.stringify({ state, keys: taken.filter(key => key.startsWith(`${subject}/`)) }))
    }
  }
  finally {
    await browser.close()
  }
}
