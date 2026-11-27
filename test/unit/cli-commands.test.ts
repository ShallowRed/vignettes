import type { DeckProblem } from '@vignettes/core/deck'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { checkDeck, PROBLEM_CODES, problemCode } from '@vignettes/core/deck'
import { describe, expect, it } from 'vitest'
import catalog from '../../layers/studio/i18n/locales/en/catalog.json' with { type: 'json' }
import editor from '../../layers/studio/i18n/locales/en/editor.json' with { type: 'json' }
import manifest from '../../packages/cli/package.json' with { type: 'json' }
import { CliError, problemMessage } from '../../packages/cli/src/messages.ts'
import { EXIT_CODES, exitCodeOf, isInteractive } from '../../packages/cli/src/output.ts'
import { COMMANDS, COMMON_OPTIONS } from '../../packages/cli/src/usage.ts'

const CLI = resolve('packages/cli/src/cli.ts')

function vignettes(...args: string[]) {
  const { status, stdout, stderr } = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' })
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
    expect(JSON.parse(vignettes('--json', 'check', 'a.md').stdout)).toMatchObject({ command: 'check', error: { code: 'missing-file' } })
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
    expect(JSON.parse(vignettes('check', 'deck.md', '--json').stdout)).toMatchObject({ ok: false, command: 'check', error: { code: 'missing-file' } })
  })
})

const VALID = 'test/e2e/fixtures/decks/composants.md'
const WITH_ERRORS = 'test/unit/fixtures/composants-inconnus.md'

// Before the command line: fetch and the sockets throw, and @napi-rs/keyring
// cannot be resolved.
const OFFLINE = `data:text/javascript,${encodeURIComponent(`
import { register } from 'node:module'
import net from 'node:net'
register('data:text/javascript,' + encodeURIComponent("export async function resolve(specifier, context, next) { if (specifier.startsWith('@napi-rs/keyring')) throw Object.assign(new Error('no keyring'), { code: 'ERR_MODULE_NOT_FOUND' }); return next(specifier, context) }"))
globalThis.fetch = () => { throw new Error('fetch called') }
net.Socket.prototype.connect = () => { throw new Error('socket opened') }
`)}`

describe('the check command (packages/cli/src/commands/check.ts)', () => {
  it('exits with 0 without an error, 1 with an error in a deck, 2 for a missing file', () => {
    const valid = vignettes('check', VALID)
    expect(valid).toEqual({ status: EXIT_CODES.success, stdout: '1 file checked: 0 errors, 0 warnings, 0 info.\n', stderr: '' })
    const failed = vignettes('check', VALID, WITH_ERRORS)
    expect(failed.status).toBe(EXIT_CODES.deckError)
    expect(failed.stdout).toContain(`${WITH_ERRORS}:7:3  error  frontmatter  Value refused: this key takes a number, such as 1280.\n`)
    expect(failed.stdout).toMatch(/^2 files checked: 2 errors, 3 warnings, 0 info\.$/m)
    expect(vignettes('check', VALID, 'absent.md')).toEqual({ status: EXIT_CODES.usage, stdout: '', stderr: 'vignettes: The file “absent.md” does not exist.\n' })
    expect(vignettes('check', 'test/unit/fixtures').stderr).toContain('cannot be read')
  })

  it('writes the problems of each file in one JSON document, the column from 0', () => {
    const { status, stdout, stderr } = vignettes('check', '--json', VALID, WITH_ERRORS)
    expect(status).toBe(EXIT_CODES.deckError)
    expect(stderr).toBe('')
    const document = JSON.parse(stdout)
    expect(document).toMatchObject({ ok: false, cli: manifest.version, command: 'check', instance: null })
    expect(document.results).toHaveLength(2)
    expect(document.results[0]).toEqual({ file: VALID, problems: [] })
    expect(document.results[1].problems[0]).toEqual({ line: 7, column: 2, severity: 'error', code: 'frontmatter', message: 'Value refused: this key takes a number, such as 1280.' })
  })

  it('opens no connection, writes no file and runs without @napi-rs/keyring', () => {
    const folder = mkdtempSync(join(tmpdir(), 'vignettes-check-'))
    try {
      copyFileSync(WITH_ERRORS, join(folder, 'deck.md'))
      const environment = { ...process.env, HOME: folder, XDG_CONFIG_HOME: join(folder, 'config') }
      const run = spawnSync(process.execPath, ['--import', OFFLINE, CLI, 'check', '--json', 'deck.md'], { cwd: folder, env: environment, encoding: 'utf8' })
      expect(run.stderr).toBe('')
      expect(run.status).toBe(EXIT_CODES.deckError)
      expect(JSON.parse(run.stdout).results[0].problems.length).toBeGreaterThan(0)
      expect(readdirSync(folder, { recursive: true })).toEqual(['deck.md'])
    }
    finally {
      rmSync(folder, { recursive: true })
    }
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

type Messages = string | { [key: string]: Messages }
const STUDIO: Messages = { ...editor, ...catalog }

/** The sentence of the studio under the dotted `key`, with the values of `params`. */
function studioSentence(key: string, params: Record<string, string>): string {
  const text = key.split('.').reduce<Messages>((entry, name) => (entry as Record<string, Messages>)[name]!, STUDIO) as string
  return text.replace(/\{'([^']*)'\}/g, '$1').replace(/\{(\w+)\}/g, (_, param: string) => params[param]!)
}

const editorSentence = (key: string, params: Record<string, string>) => studioSentence(`editor.diagnostics.${key}`, params)

const place = { line: 1, column: 0, length: 1 }
const frontmatter = (fields: Partial<Extract<DeckProblem, { check: 'frontmatter' }>>) => ({ ...place, check: 'frontmatter', severity: 'error', key: 'reveal.width', reason: 'value', message: 'Invalid input', ...fields }) as DeckProblem

const FRONTMATTER_SENTENCES: [DeckProblem, string, Record<string, string>][] = [
  [frontmatter({ key: '', reason: 'unclosed' }), 'editor.frontmatter.unclosed', {}],
  [frontmatter({ key: '', reason: 'unreadable' }), 'editor.frontmatter.invalidYaml', {}],
  [frontmatter({ key: 'title', reason: 'no-title' }), 'catalog.deckCreate.import.titleMissing', {}],
  [frontmatter({ key: 'storybook', reason: 'address' }), 'editor.diagnostics.refusedUrl', {}],
  ...(['number', 'boolean', 'string'] as const).map(expected => [frontmatter({ expected }), `editor.frontmatter.expected.${expected}`, {}] as [DeckProblem, string, Record<string, string>]),
  [frontmatter({ key: 'status', values: ['public', 'private'] }), 'editor.frontmatter.expectedValue', { values: 'public, private' }],
]

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
// their description in the core, and the editor finds the other two itself.
const CLI_SENTENCES = ['legacy', 'unknown-component', 'unknown-theme']

describe('the sentences of the problems (packages/cli/src/messages.ts)', () => {
  it.each(EDITOR_SENTENCES.map(([problem, key, params]) => [problemCode(problem), problem, key, params] as const))('copies the sentence of the editor for %s', (_, problem, key, params) => {
    const sentence = editorSentence(key, params)
    expect(problemMessage(problem)).toBe(STUDIO_HELP_KEYS.includes(key) ? sentence.slice(0, sentence.indexOf('. ') + 1) : sentence)
  })

  it.each(FRONTMATTER_SENTENCES.map(([problem, key, params]) => [key, problem, params] as const))('copies the sentence of the studio %s for a refused front matter', (key, problem, params) => {
    expect(problemMessage(problem)).toBe(studioSentence(key, params))
  })

  it('names the key of a refused value the schema gives no type or values for', () => {
    expect(problemMessage(frontmatter({ key: 'code' }))).toBe('Value of “code” refused.')
  })

  it('writes no text of the YAML parser or of the schema, and “front matter” in two words', () => {
    const raws = ['---\ntitle: A\n\n# B\n\n---\n', '---\ntitle: [A\n---\n', '---\nlang: fr\n---\n', '---\ntitle: A\nstorybook: "javascript:x"\nreveal:\n  width: large\nstatus: x\ncode: [1]\n---\n']
    const problems = raws.flatMap(raw => checkDeck(raw)).filter(problem => problem.check === 'frontmatter')
    expect(new Set(problems.map(problem => problem.check === 'frontmatter' && problem.reason))).toEqual(new Set(['unclosed', 'unreadable', 'no-title', 'address', 'value']))
    for (const problem of problems) {
      const message = problemMessage(problem)
      expect(message).not.toContain(problem.check === 'frontmatter' && problem.message)
      expect(message).not.toMatch(/frontmatter|invalid input|expected one of/i)
    }
  })

  it('compares every code of PROBLEM_CODES, apart from the sentences of the command line', () => {
    const codes = Object.values(PROBLEM_CODES).flatMap(code => typeof code === 'string' ? [code] : Object.values(code))
    const compared = [...EDITOR_SENTENCES, ...FRONTMATTER_SENTENCES].map(([problem]) => problemCode(problem))
    expect(codes.filter(code => !compared.includes(code)).sort()).toEqual(CLI_SENTENCES)
  })

  it('lists every code of PROBLEM_CODES in the README', () => {
    const codes = Object.values(PROBLEM_CODES).flatMap(code => typeof code === 'string' ? [code] : Object.values(code))
    const section = readFileSync(resolve('packages/cli/README.md'), 'utf8').split('## Codes of the problems')[1]!.split('\n## ')[0]!
    const listed = section.split('\n').filter(line => line.startsWith('- ')).flatMap(line => [...line.slice(0, line.indexOf(':')).matchAll(/`([^`]+)`/g)].map(match => match[1]))
    expect(listed.sort()).toEqual(codes.sort())
  })
})
