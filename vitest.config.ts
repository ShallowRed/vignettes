import { availableParallelism, totalmem } from 'node:os'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Plain (non-Nuxt) Vitest: deck core is framework-agnostic; server adapters are
// tested via injected fakes, so no Nuxt runtime is needed.
export default defineConfig({
  resolve: {
    alias: {
      '#shared': fileURLToPath(new URL('./layers/studio/shared', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.{test,spec}.ts'],
    globalSetup: ['test/unit/helpers/pglite-template.ts'],
    // A contract suite opens a PGlite instance, close to 1 GB per worker: the
    // workers take half the memory at most.
    maxWorkers: Math.max(1, Math.min(availableParallelism(), Math.floor(totalmem() / 2 / 2 ** 30))),
  },
})
