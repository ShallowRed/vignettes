import type { RecetteWidth } from './layers/studio/shared/recette/captures'
import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'
import { RECETTE_VIEWPORTS, RECETTE_WIDTHS } from './layers/studio/shared/recette/captures'

// The captures of the branch recette, taken on the studio that `mise run dev`
// serves (`mise run recette:capture`). One project per width; the questions run
// one after the other, since a question with gestures republishes the trial
// decks, which removes and creates them again.
// The other settings of each width, such as the touch and the user agent of the phone.
const DEVICES: Record<RecetteWidth, typeof devices[string]> = {
  desktop: devices['Desktop Chrome'],
  phone: devices['Pixel 7'],
}

export default defineConfig({
  testDir: 'test/recette-capture',
  testMatch: 'capture.recette.ts',
  // Under `.data`, which git ignores: the capture leaves the state of the worktree as it is.
  outputDir: '.data/recette/run/results',
  reporter: 'list',
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  // A deck republished by the question before takes more than the default 5 seconds to be ready.
  expect: { timeout: 30_000 },
  // The first visit of a page compiles it, and Vite may reload it once its dependencies are optimized.
  retries: 1,
  globalSetup: './test/recette-capture/setup.ts',
  globalTeardown: './test/recette-capture/teardown.ts',
  use: {
    baseURL: process.env.RECETTE_URL,
    // portless signs the local hosts with its own authority.
    ignoreHTTPSErrors: true,
    // Over HTTP/2, the page asks for its hundreds of Vite modules at once, and
    // portless opens one connection to the dev server for each: some are
    // dropped (« socket hang up » in ~/.portless/proxy.log) and the page loads
    // without them. HTTP/1.1 keeps six connections per host.
    launchOptions: { args: ['--disable-http2'] },
  },
  projects: RECETTE_WIDTHS.map(width => ({ name: width, use: { ...DEVICES[width], viewport: RECETTE_VIEWPORTS[width] } })),
})
