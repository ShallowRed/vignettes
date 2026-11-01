import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'

// Runs against the production build (`pnpm build` first), on a fresh database
// holding only the fixture decks. A second server serves the decks apart from
// the studio, on two hosts of the loopback that Chromium resolves itself. The routes do not
// depend on the browser: Firefox skips them.
const port = 3210
const database = '.data/e2e-pglite'
const originsPort = 3211

function server(port: number, database: string, env: Record<string, string> = {}) {
  return {
    command: [
      `rm -rf ${database} ${database}.lock`,
      'node scripts/db-migrate.ts',
      'node scripts/content-import.ts --content=test/e2e/fixtures/decks --apply',
      'node .output/server/index.mjs',
    ].join(' && '),
    url: `http://127.0.0.1:${port}/slides/composants`,
    reuseExistingServer: !process.env.CI,
    env: {
      PORT: String(port),
      NUXT_PGLITE_DIR: database,
      NUXT_SESSION_PASSWORD: 'e2e-session-password-not-a-secret-0000',
      ...env,
    },
  }
}

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
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, testIgnore: 'origins.e2e.ts' },
  ],
  webServer: [
    server(port, database),
    server(originsPort, '.data/e2e-origins-pglite', {
      NUXT_STUDIO_URL: `http://app.localhost:${originsPort}`,
      NUXT_PUBLIC_DECKS_URL: `http://decks.localhost:${originsPort}`,
    }),
  ],
})
