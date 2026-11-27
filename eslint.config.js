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

const ERROR_TRACKING_SDK = {
  group: ['@sentry/*'],
  message: 'The error tracking SDK is read in layers/studio/sentry.client.config.ts and layers/studio/sentry.server.config.ts: an error reaches it through Vue or Nitro.',
}
const SDK_HOME = ['layers/studio/sentry.*.config.ts']

const UMAMI_SENDER = {
  group: ['**/page-view', '**/page-view.ts'],
  importNames: ['sendToUmami'],
  message: 'Send an event to Umami through track() of layers/studio/src/composables/useStudioEvent.ts, declared in layers/studio/shared/telemetry/events.ts.',
}
const UMAMI_SENDER_HOME = ['layers/studio/src/composables/useStudioEvent.ts', 'site/app/plugins/page-views.client.ts']

const DOMAIN_IO = [
  MDC_READER,
  DATABASE_DRIVER,
  ERROR_TRACKING_SDK,
  UMAMI_SENDER,
  { group: ['h3'], message: 'shared/ is the framework-free domain: move request handling to server/utils/.' },
  { group: ['@aws-sdk/*'], message: 'shared/ has no I/O: place the S3 access in server/utils/.' },
  { group: ['node:*'], message: 'shared/ runs on the client and the server: take the value as an argument from an entry point.' },
  { group: ['@vignettes/nuxt', '@vignettes/nuxt/*'], message: 'shared/ must not depend on the render module: use @vignettes/core.' },
]

const YJS = { group: ['yjs', 'yjs/*'], message: 'In shared/, yjs belongs to shared/collab/.' }

const MDC_HOME = ['packages/nuxt/**', 'nuxt.config.ts', 'layers/studio/src/mdc.config.ts', 'test/**']

const EXTENSION_PACKAGE_HOME = ['packages/schemas/src/**', 'packages/storybook/src/**']
const EXTENSION_PACKAGE = {
  regex: '^@vignettes/(?!(core|nuxt)(/|$))',
  message: 'An extension package (@vignettes/schemas, @vignettes/storybook) imports @vignettes/core and @vignettes/nuxt, and no other package of the repository: a component two extensions share belongs to @vignettes/nuxt or @vignettes/core.',
}

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
// The selectors of @antfu/eslint-config, which a block that sets the rule replaces.
const ANTFU_RESTRICTED_SYNTAX = ['TSEnumDeclaration[const=true]', 'TSExportAssignment']
const REQUEST_HOST = [
  ...ANTFU_RESTRICTED_SYNTAX,
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

// The PowerPoint writer runs in the browser and in Node, and reaches no resource itself.
const PPTX_BROWSER_GLOBALS = ['fetch', 'XMLHttpRequest', 'document', 'window', 'Image', 'navigator']
const PPTX_WRITER_MESSAGE = '@vignettes/pptx writes a PPTX from a deck model: it imports @vignettes/core, pptxgenjs, jszip and pptx-embed-fonts. Image and font loading, the DOM and the download belong to packages/nuxt/src/runtime/utils/pptx-export.ts.'

// The command line: each resource has one module of packages/cli/src, and a
// block per module lifts the rule of its own resource.
const CLI_HOMES = {
  env: 'packages/cli/src/cli.ts',
  output: 'packages/cli/src/output.ts',
  prompt: 'packages/cli/src/prompt.ts',
  storage: 'packages/cli/src/storage.ts',
  remote: 'packages/cli/src/remote.ts',
}
const CLI_ENV_MESSAGE = 'packages/cli/src/cli.ts reads the environment and passes the values as arguments.'
const CLI_OUTPUT_MESSAGE = 'packages/cli/src/output.ts writes the standard output and sets the exit code.'
const CLI_KEYRING_MESSAGE = 'packages/cli/src/storage.ts loads @napi-rs/keyring, with import() when a command needs a secret, so that check runs without it.'
const CLI_FETCH_MESSAGE = 'packages/cli/src/remote.ts calls the instances.'

function cliBoundaries(home) {
  return {
    'no-restricted-imports': ['error', {
      paths: [
        ...(home === 'env' ? [] : [{ name: 'node:process', importNames: ['env'], message: CLI_ENV_MESSAGE }]),
        ...(home === 'output' ? [] : [{ name: 'node:process', importNames: ['stdout', 'exit', 'exitCode'], message: CLI_OUTPUT_MESSAGE }]),
      ],
      patterns: [
        { group: ['**/layers/**'], message: 'The CLI declares the answers it reads in packages/cli/src/api.ts.' },
        ...(home === 'prompt' ? [] : [{ group: ['@clack/prompts'], message: 'packages/cli/src/prompt.ts asks the questions, on the standard error.' }]),
        { group: ['@napi-rs/keyring'], message: CLI_KEYRING_MESSAGE },
        {
          regex: '^(?!(@vignettes/core/.+|@vignettes/schemas/components|@vignettes/storybook/components|zod|node:.+|@clack/prompts|@napi-rs/keyring)$|\\.{1,2}/)',
          message: '@vignettes/cli imports @vignettes/core, @vignettes/schemas/components, @vignettes/storybook/components, zod, the node: modules and its own files.',
        },
      ],
    }],
    'no-restricted-properties': ['error', ...[
      ...(home === 'env' ? [] : [{ object: 'process', property: 'env', message: CLI_ENV_MESSAGE }]),
      ...(home === 'output' ? [] : ['stdout', 'exit', 'exitCode'].map(property => ({ object: 'process', property, message: CLI_OUTPUT_MESSAGE }))),
      ...(home === 'remote' ? [] : [{ object: 'globalThis', property: 'fetch', message: CLI_FETCH_MESSAGE }]),
    ]],
    'no-restricted-globals': ['error', ...[
      ...(home === 'output' ? [] : [{ name: 'console', message: CLI_OUTPUT_MESSAGE }]),
      ...(home === 'remote' ? [] : [{ name: 'fetch', message: CLI_FETCH_MESSAGE }]),
    ]],
    // no-restricted-imports reads the static imports only.
    'no-restricted-syntax': ['error', ...ANTFU_RESTRICTED_SYNTAX, ...(home === 'storage' ? [] : [{ selector: 'ImportExpression[source.value=\'@napi-rs/keyring\']', message: CLI_KEYRING_MESSAGE }])],
  }
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
    'no-restricted-imports': ['error', { patterns: [MDC_READER, DATABASE_DRIVER, ERROR_TRACKING_SDK, UMAMI_SENDER] }],
  },
}, {
  files: EXTENSION_PACKAGE_HOME,
  rules: {
    'no-restricted-imports': ['error', { patterns: [MDC_READER, DATABASE_DRIVER, ERROR_TRACKING_SDK, UMAMI_SENDER, EXTENSION_PACKAGE] }],
  },
}, {
  files: SDK_HOME,
  rules: {
    'no-restricted-imports': ['error', { patterns: [MDC_READER, DATABASE_DRIVER, UMAMI_SENDER] }],
  },
}, {
  files: DRIVER_HOME,
  rules: {
    'no-restricted-imports': ['error', { patterns: [MDC_READER, ERROR_TRACKING_SDK, UMAMI_SENDER] }],
  },
}, {
  files: MDC_HOME,
  ignores: DRIVER_TESTS,
  rules: {
    'no-restricted-imports': ['error', { patterns: [DATABASE_DRIVER, ERROR_TRACKING_SDK, UMAMI_SENDER] }],
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
      }, UMAMI_SENDER],
    }],
    'no-restricted-properties': ['error', PROCESS_ENV],
  },
}, {
  files: ['packages/pptx/src/**'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [{
        regex: '^(?!(@vignettes/core(/.*)?|pptxgenjs|jszip|pptx-embed-fonts)$|\\.{1,2}/)',
        message: PPTX_WRITER_MESSAGE,
      }, UMAMI_SENDER],
    }],
    'no-restricted-globals': ['error', ...PPTX_BROWSER_GLOBALS.map(name => ({ name, message: PPTX_WRITER_MESSAGE }))],
    'no-restricted-properties': ['error', PROCESS_ENV, ...PPTX_BROWSER_GLOBALS.map(property => ({ object: 'globalThis', property, message: PPTX_WRITER_MESSAGE }))],
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
}, {
  files: UMAMI_SENDER_HOME,
  rules: {
    'no-restricted-imports': ['error', { patterns: [MDC_READER, DATABASE_DRIVER, ERROR_TRACKING_SDK] }],
  },
}, {
  files: ['packages/cli/src/**'],
  rules: cliBoundaries(),
}, ...Object.entries(CLI_HOMES).map(([home, file]) => ({
  files: [file],
  rules: cliBoundaries(home),
})))
