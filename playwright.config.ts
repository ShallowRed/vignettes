import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'

// Runs against the production build (`pnpm build` first), on a fresh database
// holding only the fixture decks.
const port = 3210
const database = '.data/e2e-pglite'

export default defineConfig({
  testDir: 'test/e2e',
  testMatch: '*.e2e.ts',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  webServer: {
    command: [
      `rm -rf ${database} ${database}.lock`,
      'node scripts/db-migrate.ts',
      'node scripts/content-import.ts --content=test/e2e/fixtures/decks --apply',
      'node .output/server/index.mjs',
    ].join(' && '),
    url: `http://localhost:${port}/slides/composants`,
    reuseExistingServer: !process.env.CI,
    env: {
      PORT: String(port),
      NUXT_PGLITE_DIR: database,
      NUXT_SESSION_PASSWORD: 'e2e-session-password-not-a-secret-0000',
    },
  },
})
