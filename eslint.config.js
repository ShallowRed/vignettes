import antfu from '@antfu/eslint-config'

export default antfu({
  vue: true,
  // Drizzle rewrites these on every `drizzle-kit generate` (no trailing newline),
  // so linting them only invites `--fix` to churn generated files.
  ignores: ['layers/studio/server/db/migrations/**', 'packages/core/src/theme/tokens.generated.ts'],
  rules: {
    'no-console': 'off',
    'no-debugger': 'off',
    'eslint-comments/no-unlimited-disable': 'off',
    'ts/ban-ts-comment': 'off',
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
})
