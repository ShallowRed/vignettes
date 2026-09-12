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
  },
})
