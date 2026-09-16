import { LanguageDescription } from '@codemirror/language'

/**
 * Languages highlighted inside the fenced code blocks of a deck. Each parser
 * loads the first time a block names its language.
 */
export const CODE_LANGUAGES = [
  LanguageDescription.of({
    name: 'JSON',
    alias: ['json', 'jsonld', 'json5', 'jsonc'],
    load: () => import('@codemirror/lang-json').then(m => m.json()),
  }),
  LanguageDescription.of({
    name: 'YAML',
    alias: ['yaml', 'yml'],
    load: () => import('@codemirror/lang-yaml').then(m => m.yaml()),
  }),
  LanguageDescription.of({
    name: 'JavaScript',
    alias: ['js', 'javascript', 'mjs'],
    load: () => import('@codemirror/lang-javascript').then(m => m.javascript()),
  }),
  LanguageDescription.of({
    name: 'TypeScript',
    alias: ['ts', 'typescript'],
    load: () => import('@codemirror/lang-javascript').then(m => m.javascript({ typescript: true })),
  }),
]
