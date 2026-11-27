import type { DeckProblem } from '@vignettes/core/deck'
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { PROBLEM_CODES, problemCode } from '@vignettes/core/deck'
import { describe, expect, it } from 'vitest'
import editor from '../../layers/studio/i18n/locales/en/editor.json' with { type: 'json' }
import manifest from '../../packages/cli/package.json' with { type: 'json' }
import { CliError, problemMessage } from '../../packages/cli/src/messages.ts'
import { EXIT_CODES, exitCodeOf, isInteractive } from '../../packages/cli/src/output.ts'
import { COMMANDS, COMMON_OPTIONS } from '../../packages/cli/src/usage.ts'

function vignettes(...args: string[]) {
  const { status, stdout, stderr } = spawnSync(process.execPath, ['packages/cli/src/cli.ts', ...args], { encoding: 'utf8' })
  return { status, stdout, stderr }
}

describe('the options of the command line (packages/cli/src/usage.ts)', () => {
  it('gives each command the exact list of its options, the common ones apart', () => {
    expect(Object.keys(COMMON_OPTIONS)).toEqual(['json', 'help', 'version'])
    expect(Object.fromEntries(Object.entries(COMMANDS).map(([name, command]) => [name, Object.keys(command.options)]))).toEqual({
      check: [],
    })
  })

  it('gives no option a token: login reads it from a masked question or from the standard input', () => {
    for (const command of Object.values(COMMANDS)) {
      for (const [name, option] of Object.entries(command.options)) {
        if (/token|secret|password/i.test(name))
          expect(option.type, name).toBe('boolean')
      }
    }
  })
})

describe('the entry point (packages/cli/src/cli.ts)', () => {
  it('reads the command at the first argument that is not an option', () => {
    expect(JSON.parse(vignettes('--json', 'check', 'a.md').stdout)).toMatchObject({ command: 'check', error: { code: 'not-implemented' } })
  })

  it('answers --version and --help with code 0', () => {
    expect(vignettes('--version')).toMatchObject({ status: 0, stdout: `${manifest.version}\n` })
    const help = vignettes('--help')
    expect(help.status).toBe(0)
    for (const name of Object.keys(COMMANDS))
      expect(help.stdout).toContain(`  ${name} `)
    expect(vignettes('check', '--help').stdout).toMatch(/^Usage: vignettes check <file…> \[options\]/)
  })

  it.each([
    [['--bogus'], '“--bogus”'],
    [['check', '--token', 'abc'], '“--token”'],
    [['login'], '“login”'],
    [['--json=yes'], '“--json”'],
    [['check'], '<file>'],
    [[], 'Name a command'],
    [['--', 'check'], 'Name a command'],
  ])('stops %j with code 2 and a message that names %s', (args, named) => {
    const { status, stdout, stderr } = vignettes(...args)
    expect(status).toBe(EXIT_CODES.usage)
    expect(stdout).toBe('')
    expect(stderr).toContain(named)
  })

  it('answers a declared command that this version leaves out with a usage error', () => {
    const { status, stderr } = vignettes('check', 'deck.md')
    expect(status).toBe(EXIT_CODES.usage)
    expect(stderr).toContain('“check” is not available')
  })

  it('writes one JSON document on the standard output with --json, an error included', () => {
    const unknown = vignettes('--json', '--bogus')
    expect(unknown.status).toBe(EXIT_CODES.usage)
    expect(unknown.stderr).toBe('')
    expect(JSON.parse(unknown.stdout)).toEqual({
      ok: false,
      cli: manifest.version,
      command: null,
      instance: null,
      error: { code: 'unknown-option', message: expect.stringContaining('“--bogus”') },
    })
    expect(JSON.parse(vignettes('check', 'deck.md', '--json').stdout)).toMatchObject({ ok: false, command: 'check', error: { code: 'not-implemented' } })
  })
})

describe('the exit codes (packages/cli/src/output.ts)', () => {
  it('keeps the table of the contract', () => {
    expect(Object.values(EXIT_CODES)).toEqual([0, 1, 2, 3, 4, 5, 6, 70, 130])
  })

  it('gives an unexpected error code 70 and Ctrl+C code 130', () => {
    expect(exitCodeOf(new TypeError('boom'))).toBe(70)
    expect(exitCodeOf('boom')).toBe(70)
    expect(exitCodeOf(new CliError('interrupted'))).toBe(130)
  })

  it('asks no question with --json, without a terminal on the standard input or with CI set', () => {
    expect(isInteractive({ json: false, stdinIsTTY: true, ci: false })).toBe(true)
    expect(isInteractive({ json: true, stdinIsTTY: true, ci: false })).toBe(false)
    expect(isInteractive({ json: false, stdinIsTTY: false, ci: false })).toBe(false)
    expect(isInteractive({ json: false, stdinIsTTY: true, ci: true })).toBe(false)
  })
})

const DIAGNOSTICS: Record<string, string | Record<string, string>> = editor.editor.diagnostics

/** The sentence of the editor under `key`, with the values of `params`. */
function editorSentence(key: string, params: Record<string, string>): string {
  const [group, name] = key.split('.')
  const entry = DIAGNOSTICS[group!]
  const text = typeof entry === 'string' ? entry : entry![name!]!
  return text.replace(/\{'([^']*)'\}/g, '$1').replace(/\{(\w+)\}/g, (_, param: string) => params[param]!)
}

const place = { line: 1, column: 0, length: 1 }
const EDITOR_SENTENCES: [DeckProblem, string, Record<string, string>][] = [
  ...(['brace', 'quote', 'typographic'] as const).map(reason => [{ ...place, check: 'malformed', severity: 'error', name: 'Columns', reason }, `malformedAttributes.${reason}`, { name: 'Columns' }] as [DeckProblem, string, Record<string, string>]),
  ...([['unknown', 'attributeUnknown'], ['false-text', 'attributeFalseText'], ['no-value', 'attributeNoValue'], ['missing', 'attributeMissing']] as const).map(([kind, key]) => [{ ...place, check: 'component-attribute', severity: 'warning', kind, component: 'Columns', name: 'gap' }, key, { component: 'Columns', name: 'gap' }] as [DeckProblem, string, Record<string, string>]),
  [{ ...place, check: 'unclosed', severity: 'error', name: 'Columns', colons: '::' }, 'unclosedBlock', { name: 'Columns', colons: '::' }],
  ...([['url', 'refusedUrl'], ['binding', 'refusedBinding'], ['http', 'refusedEmbed']] as const).map(([reason, key]) => [{ ...place, check: 'refused', severity: 'error', name: 'src', reason }, key, {}] as [DeckProblem, string, Record<string, string>]),
  ...([['unknown-attribute', 'layoutUnknownAttribute'], ['invalid-value', 'layoutInvalidValue'], ['missing-source', 'layoutMissingSource'], ['unused', 'layoutUnused'], ['behind-needs-image', 'layoutBehindNeedsImage']] as const).map(([kind, key]) => [{ ...place, check: 'layout', severity: 'warning', kind, attribute: 'size' }, key, { name: 'size' }] as [DeckProblem, string, Record<string, string>]),
]

// Keys whose second sentence is a help of the screen of the studio: the command
// line keeps the first one.
const STUDIO_HELP_KEYS = ['attributeUnknown', 'layoutUnknownAttribute', 'layoutInvalidValue']

// The editor writes no sentence of its own for these: the earlier forms carry
// their description in the core, and the editor finds the other three itself.
const CLI_SENTENCES = ['frontmatter', 'legacy', 'unknown-component', 'unknown-theme']

describe('the sentences of the problems (packages/cli/src/messages.ts)', () => {
  it.each(EDITOR_SENTENCES.map(([problem, key, params]) => [problemCode(problem), problem, key, params] as const))('copies the sentence of the editor for %s', (_, problem, key, params) => {
    const sentence = editorSentence(key, params)
    expect(problemMessage(problem)).toBe(STUDIO_HELP_KEYS.includes(key) ? sentence.slice(0, sentence.indexOf('. ') + 1) : sentence)
  })

  it('compares every code of PROBLEM_CODES, apart from the sentences of the command line', () => {
    const codes = Object.values(PROBLEM_CODES).flatMap(code => typeof code === 'string' ? [code] : Object.values(code))
    const compared = EDITOR_SENTENCES.map(([problem]) => problemCode(problem))
    expect(codes.filter(code => !compared.includes(code)).sort()).toEqual(CLI_SENTENCES)
  })
})
