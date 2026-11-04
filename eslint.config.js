import antfu from '@antfu/eslint-config'

// Architecture boundaries (docs/architecture.md). A later block replaces the
// options of an earlier one for the same rule, so the MDC boundary comes first
// and every narrower block repeats it.
const MDC_READER = {
  group: ['@nuxtjs/mdc', '@nuxtjs/mdc/*'],
  message: 'MDC is read by the render module (packages/nuxt): parse or render a deck through @vignettes/nuxt.',
}

const DATABASE_DRIVER = {
  group: ['drizzle-orm', 'drizzle-orm/*', 'better-sqlite3', 'pg', '@electric-sql/pglite', '@electric-sql/pglite/*'],
  message: 'The adapters (server/db/sqlite/, server/db/postgres/) read and write the tables: add a method to a port of server/db/ports.ts, reached through useStores() or, in a script, openDatabaseFile().',
}

const DOMAIN_IO = [
  MDC_READER,
  DATABASE_DRIVER,
  { group: ['h3'], message: 'shared/ is the framework-free domain: move request handling to server/utils/.' },
  { group: ['@aws-sdk/*'], message: 'shared/ has no I/O: place the S3 access in server/utils/.' },
  { group: ['node:*'], message: 'shared/ runs on the client and the server: take the value as an argument from an entry point.' },
  { group: ['@vignettes/nuxt', '@vignettes/nuxt/*'], message: 'shared/ must not depend on the render module: use @vignettes/core.' },
]

const YJS = { group: ['yjs', 'yjs/*'], message: 'In shared/, yjs belongs to shared/collab/.' }

const MDC_HOME = ['packages/nuxt/**', 'nuxt.config.ts', 'layers/studio/src/mdc.config.ts', 'test/**']
const DRIVER_HOME = ['layers/studio/server/db/sqlite/**', 'layers/studio/server/db/postgres/**']
// The test helpers open each adapter; migrations.test.ts applies the SQLite migrations by hand.
const DRIVER_TESTS = ['test/unit/helpers/**', 'test/unit/migrations.test.ts']

const SERVER_ENV = {
  object: 'process',
  property: 'env',
  message: 'The server reads its configuration in server/utils/config.ts: add the value to serverConfig().',
}

const REQUEST_HOST_MESSAGE = 'The host a request reaches is read in server/utils/deck-origin.ts: use requestOrigin() or requestSide().'
const HOST_HEADER = '/^(?:host|x-forwarded-host)$/i'
const REQUEST_HOST = [
  // The selectors of @antfu/eslint-config, which a block that sets the rule replaces.
  'TSEnumDeclaration[const=true]',
  'TSExportAssignment',
  { selector: 'CallExpression[callee.name=/^getRequest(?:URL|Host)$/]', message: REQUEST_HOST_MESSAGE },
  { selector: `CallExpression[callee.name='getRequestHeader'][arguments.1.value=${HOST_HEADER}]`, message: REQUEST_HOST_MESSAGE },
  { selector: `MemberExpression[object.callee.name='getRequestHeaders'][property.name=${HOST_HEADER}]`, message: REQUEST_HOST_MESSAGE },
  { selector: `CallExpression[callee.property.name='get'][callee.object.property.name='headers'][arguments.0.value=${HOST_HEADER}]`, message: REQUEST_HOST_MESSAGE },
]

// One Yjs lineage per draft: the server writes a draft through collab.ts, whose
// store merges each write into the stored draft and refuses another lineage.
const DRAFT_STORE_MESSAGE = 'Write a draft through useDraftStore() or writeDraftText() of server/utils/collab.ts, which keep its Yjs lineage.'
const DRAFT_STORE = [
  { selector: 'MemberExpression[property.name="drafts"][object.type="CallExpression"][object.callee.name="useStores"]', message: DRAFT_STORE_MESSAGE },
  { selector: 'VariableDeclarator[init.callee.name="useStores"] > ObjectPattern > Property[key.name="drafts"]', message: DRAFT_STORE_MESSAGE },
]

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
  ignores: ['layers/studio/server/db/sqlite/migrations/**', 'layers/studio/server/db/postgres/migrations/**', 'packages/core/src/theme/tokens.generated.ts', '.claude/**'],
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
  ignores: [...MDC_HOME, ...DRIVER_HOME],
  rules: {
    'no-restricted-imports': ['error', { patterns: [MDC_READER, DATABASE_DRIVER] }],
  },
}, {
  files: DRIVER_HOME,
  rules: {
    'no-restricted-imports': ['error', { patterns: [MDC_READER] }],
  },
}, {
  files: MDC_HOME,
  ignores: DRIVER_TESTS,
  rules: {
    'no-restricted-imports': ['error', { patterns: [DATABASE_DRIVER] }],
  },
}, {
  files: ['layers/studio/server/**'],
  ignores: ['layers/studio/server/utils/config.ts'],
  rules: {
    'no-restricted-properties': ['error', SERVER_ENV],
  },
}, {
  files: ['layers/studio/server/**'],
  ignores: ['layers/studio/server/utils/deck-origin.ts', 'layers/studio/server/utils/collab.ts'],
  rules: {
    'no-restricted-syntax': ['error', ...REQUEST_HOST, ...DRAFT_STORE],
  },
}, {
  files: ['layers/studio/server/utils/collab.ts'],
  rules: {
    'no-restricted-syntax': ['error', ...REQUEST_HOST],
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
