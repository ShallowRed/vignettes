import antfu from '@antfu/eslint-config'

// Architecture boundaries (docs/architecture.md). A later block replaces the
// options of an earlier one for the same rule, so the MDC boundary comes first
// and every narrower block repeats it.
const MDC_READER = {
  group: ['@nuxtjs/mdc', '@nuxtjs/mdc/*'],
  message: 'MDC is read by the render module (packages/nuxt): parse or render a deck through @vignettes/nuxt.',
}

const DOMAIN_IO = [
  MDC_READER,
  { group: ['h3', 'drizzle-orm', 'drizzle-orm/*'], message: 'shared/ is the framework-free domain: move request and database access to server/utils/.' },
  { group: ['@aws-sdk/*'], message: 'shared/ has no I/O: place the S3 access in server/utils/.' },
  { group: ['node:*'], message: 'shared/ runs on the client and the server: take the value as an argument from an entry point.' },
  { group: ['@vignettes/nuxt', '@vignettes/nuxt/*'], message: 'shared/ must not depend on the render module: use @vignettes/core.' },
]

const YJS = { group: ['yjs', 'yjs/*'], message: 'In shared/, yjs belongs to shared/collab/.' }

const SERVER_ENV = {
  object: 'process',
  property: 'env',
  message: 'The server reads its configuration in server/utils/config.ts: add the value to serverConfig().',
}

const PROCESS_ENV = {
  object: 'process',
  property: 'env',
  message: 'Configuration is read in an entry point (nuxt.config.ts, server plugins, scripts) and passed as an argument.',
}

export default antfu({
  vue: true,
  // Drizzle rewrites these on every `drizzle-kit generate` (no trailing newline),
  // so linting them only invites `--fix` to churn generated files.
  // `.claude/` holds the worktrees of the agent sessions.
  ignores: ['layers/studio/server/db/migrations/**', 'packages/core/src/theme/tokens.generated.ts', '.claude/**'],
  rules: {
    'no-console': 'off',
    'no-debugger': 'off',
    'eslint-comments/no-unlimited-disable': 'off',
    'ts/ban-ts-comment': 'off',
  },
}, {
  // Command-line helpers the freeze runs with node, where top-level await is the
  // plain way to write them.
  files: ['packages/freeze/src/*.js'],
  rules: {
    'antfu/no-top-level-await': 'off',
  },
}, {
  files: ['**/*.vue'],
  rules: {
    'vue/max-attributes-per-line': [
      'error',
      {
        singleline: {
          max: 1,
        },
        multiline: {
          max: 1,
        },
      },
    ],
  },
}, {
  files: ['**/*.{js,ts,vue}'],
  ignores: ['packages/nuxt/**', 'nuxt.config.ts', 'layers/studio/src/mdc.config.ts', 'test/**'],
  rules: {
    'no-restricted-imports': ['error', { patterns: [MDC_READER] }],
  },
}, {
  files: ['layers/studio/server/**'],
  ignores: ['layers/studio/server/utils/config.ts'],
  rules: {
    'no-restricted-properties': ['error', SERVER_ENV],
  },
}, {
  files: ['packages/core/src/**'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [{
        regex: '^(?!(zod|js-yaml|slugify)$|\\.{1,2}/)',
        message: '@vignettes/core is framework-free: it imports zod, js-yaml, slugify and its own files.',
      }],
    }],
    'no-restricted-properties': ['error', PROCESS_ENV],
  },
}, {
  files: ['layers/studio/shared/**'],
  ignores: ['layers/studio/shared/collab/**'],
  rules: {
    'no-restricted-imports': ['error', { patterns: [...DOMAIN_IO, YJS] }],
    'no-restricted-properties': ['error', PROCESS_ENV],
  },
}, {
  files: ['layers/studio/shared/collab/**'],
  rules: {
    'no-restricted-imports': ['error', { patterns: DOMAIN_IO }],
    'no-restricted-properties': ['error', PROCESS_ENV],
  },
})
