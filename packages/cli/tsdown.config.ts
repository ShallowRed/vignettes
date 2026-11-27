import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/cli.ts'],
  format: 'esm',
  platform: 'node',
  // The packages of the repository go into the built file: the published
  // package depends on none of them.
  deps: {
    alwaysBundle: ['@vignettes/core', '@vignettes/schemas', '@vignettes/storybook'],
  },
  // One file: src/target.ts loads src/storage.ts by import(), which would
  // otherwise get a file of its own.
  outputOptions: { codeSplitting: false },
})
