import type { FullConfig, Page } from '@playwright/test'
import type { BranchRecetteAnswer, RecetteQuestion } from '../../layers/studio/shared/recette/branch'
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from '@playwright/test'
import { RECETTE_CAPTURE_DIR, recetteSubject } from '../../layers/studio/shared/recette/captures'
import { pruneSubject } from './prune-subject'

/** The files of a capture run, under `.data`, which git ignores. */
const RUN_DIR = '.data/recette/run'
export const OWNER_STATE = join(RUN_DIR, 'owner.json')
const PLAN = join(RUN_DIR, 'plan.json')
/** The keys of the captures the run took, one per line, which each test that passes adds to. */
const TAKEN = join(RUN_DIR, 'taken')

export interface CapturePlan {
  /** The state of the worktree when the run starts, which the teardown compares. */
  state: string | null
  questions: Array<RecetteQuestion & { subject: string }>
}

export const readPlan = (): CapturePlan => JSON.parse(readFileSync(PLAN, 'utf8'))

export const recordTaken = (key: string): void => appendFileSync(TAKEN, `${key}\n`)
export const readTaken = (): string[] => existsSync(TAKEN) ? readFileSync(TAKEN, 'utf8').split('\n').filter(Boolean) : []

/** Reads the recette of the branch from a page of the studio, after it republishes the trial decks with `publish`. */
export async function fetchBranchRecette(page: Page, { publish }: { publish: boolean }): Promise<BranchRecetteAnswer> {
  return page.evaluate(async (publish) => {
    // From the page, so the requests carry the origin the studio checks.
    if (publish) {
      const published = await fetch('/api/recette/branch', { method: 'POST' })
      if (!published.ok)
        throw new Error(`POST /api/recette/branch: ${published.status}`)
    }
    const answer = await fetch('/api/recette/branch')
    if (!answer.ok)
      throw new Error(`GET /api/recette/branch: ${answer.status}`)
    return answer.json()
  }, publish)
}

/**
 * Opens the studio as its owner, which issues the recette pass, republishes
 * the trial decks from their file, and writes the questions to capture with
 * the state of the worktree; removes the captures of the questions missing
 * from their file.
 */
export default async function setup(config: FullConfig): Promise<void> {
  const use = config.projects[0]?.use ?? {}
  if (!use.baseURL)
    throw new Error('RECETTE_URL names the studio that mise run dev serves: run mise run recette:capture')
  const browser = await chromium.launch(use.launchOptions)
  try {
    const context = await browser.newContext({ baseURL: use.baseURL, ignoreHTTPSErrors: use.ignoreHTTPSErrors })
    const page = await context.newPage()
    await page.goto('/auth/dev-login?role=owner&redirect=/')
    const recette = await fetchBranchRecette(page, { publish: true })
    mkdirSync(RUN_DIR, { recursive: true })
    rmSync(TAKEN, { force: true })
    await context.storageState({ path: OWNER_STATE })

    const questions: CapturePlan['questions'] = []
    for (const file of recette.files) {
      const subject = recetteSubject(file.path)
      if ('error' in file || subject === undefined) {
        console.error(`${file.path}: ${'error' in file ? file.error : 'not a recette file'}`)
        continue
      }
      await pruneSubject(RECETTE_CAPTURE_DIR, subject, file.questions.map(question => question.id))
      questions.push(...file.questions.map(({ captures: _, ...question }) => ({ ...question, subject })))
    }
    writeFileSync(PLAN, JSON.stringify({ state: recette.state, questions } satisfies CapturePlan))
  }
  finally {
    await browser.close()
  }
}
