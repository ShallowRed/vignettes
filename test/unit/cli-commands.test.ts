import type { DeckProblem } from '@vignettes/core/deck'
import type { OptionUsage } from '../../packages/cli/src/usage.ts'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { checkDeck, PROBLEM_CODES, problemCode } from '@vignettes/core/deck'
import { afterAll, describe, expect, it, vi } from 'vitest'
import catalog from '../../layers/studio/i18n/locales/en/catalog.json' with { type: 'json' }
import editor from '../../layers/studio/i18n/locales/en/editor.json' with { type: 'json' }
import manifest from '../../packages/cli/package.json' with { type: 'json' }
import { CliError, problemMessage } from '../../packages/cli/src/messages.ts'
import { createOutput, EXIT_CODES, exitCodeOf, isInteractive } from '../../packages/cli/src/output.ts'
import { PUSH_PROBLEM_CODES } from '../../packages/cli/src/push-plan.ts'
import { COMMANDS, COMMON_OPTIONS } from '../../packages/cli/src/usage.ts'

const CLI = resolve('packages/cli/src/cli.ts')

// Before the command line: fetch and the sockets throw, and @napi-rs/keyring
// cannot be resolved.
const OFFLINE = `data:text/javascript,${encodeURIComponent(`
import { register } from 'node:module'
import net from 'node:net'
register('data:text/javascript,' + encodeURIComponent("export async function resolve(specifier, context, next) { if (specifier.startsWith('@napi-rs/keyring')) throw Object.assign(new Error('no keyring'), { code: 'ERR_MODULE_NOT_FOUND' }); return next(specifier, context) }"))
globalThis.fetch = () => { throw new Error('fetch called') }
net.Socket.prototype.connect = () => { throw new Error('socket opened') }
`)}`

// An empty configuration folder, and none of the variables of the machine
// that name an instance or carry a token.
const CONFIG_HOME = mkdtempSync(join(tmpdir(), 'vignettes-commands-'))
afterAll(() => rmSync(CONFIG_HOME, { recursive: true }))
const ENVIRONMENT = Object.fromEntries(Object.entries(process.env).filter(([name]) => !['VIGNETTES_INSTANCE', 'VIGNETTES_TOKEN', 'CI'].includes(name)))

function vignettes(args: string[], variables: Record<string, string> = {}) {
  const env = { ...ENVIRONMENT, XDG_CONFIG_HOME: CONFIG_HOME, ...variables }
  const { status, stdout, stderr } = spawnSync(process.execPath, ['--import', OFFLINE, CLI, ...args], { encoding: 'utf8', env })
  return { status, stdout, stderr }
}

describe('the options of the command line (packages/cli/src/usage.ts)', () => {
  it('gives each command the exact list of its options, the common ones apart', () => {
    expect(Object.keys(COMMON_OPTIONS)).toEqual(['json', 'help', 'version'])
    expect(Object.fromEntries(Object.entries(COMMANDS).map(([name, command]) => [name, Object.keys(command.options)]))).toEqual({
      check: [],
      login: ['instance', 'name', 'token-stdin'],
      logout: ['instance', 'local'],
      whoami: ['instance'],
      push: ['slug', 'folder', 'dry-run', 'force', 'instance'],
      pull: ['draft', 'out', 'force', 'instance'],
    })
  })

  it('gives no option a token: login reads it from a masked question or from the standard input', () => {
    const options = Object.values(COMMANDS).flatMap(command => Object.entries(command.options) as [string, OptionUsage][])
    expect(options.filter(([name]) => /token|secret|password|key/i.test(name))).toEqual([['token-stdin', expect.objectContaining({ type: 'boolean' })]])
    for (const [name, option] of options)
      expect(option.type === 'boolean' || ['instance', 'name', 'slug', 'folder', 'out'].includes(name), name).toBe(true)
  })
})

describe('the entry point (packages/cli/src/cli.ts)', () => {
  it('reads the command at the first argument that is not an option', () => {
    expect(JSON.parse(vignettes(['--json', 'check', 'a.md']).stdout)).toMatchObject({ command: 'check', error: { code: 'missing-file' } })
  })

  it('answers --version and --help with code 0', () => {
    expect(vignettes(['--version'])).toMatchObject({ status: 0, stdout: `${manifest.version}\n` })
    const help = vignettes(['--help'])
    expect(help.status).toBe(0)
    for (const name of Object.keys(COMMANDS))
      expect(help.stdout).toContain(`  ${name} `)
    expect(vignettes(['check', '--help']).stdout).toMatch(/^Usage: vignettes check <file…> \[options\]/)
    expect(vignettes(['login', '--help']).stdout).toMatch(/^Usage: vignettes login \[options\][\s\S]*--instance <origin or name>[\s\S]*--token-stdin /)
  })

  it.each([
    [['login', '--instance', 'https://studio.example.test'], {}],
    [['login', '--instance', 'https://studio.example.test'], { CI: '1' }],
    [['login', '--instance', 'https://studio.example.test', '--json'], {}],
  ])('asks no question for %j with %j and no terminal, and names --token-stdin', (args, variables) => {
    const { status, stdout, stderr } = vignettes(args, variables)
    expect(status).toBe(EXIT_CODES.usage)
    if (args.includes('--json'))
      expect(JSON.parse(stdout)).toMatchObject({ instance: null, error: { code: 'missing-token', message: expect.stringContaining('--token-stdin') } })
    else
      expect(stderr).toContain('--token-stdin')
  })

  it('refuses logout while VIGNETTES_TOKEN is set, and does not write the token', () => {
    const token = 'vgt_made-up-secret-of-the-variable'
    const { status, stdout, stderr } = vignettes(['logout', '--instance', 'https://studio.example.test'], { VIGNETTES_TOKEN: token })
    expect(status).toBe(EXIT_CODES.usage)
    expect(stderr).toContain('VIGNETTES_TOKEN is set')
    expect(stdout + stderr).not.toContain(token)
  })

  it.each([
    [['--bogus'], '“--bogus”'],
    [['check', '--token', 'abc'], '“--token”'],
    [['login', '--token', 'abc'], '“--token”'],
    [['whoami', '--token=abc'], '“--token”'],
    [['logout', '--name', 'studio'], '“--name”'],
    [['bogus'], '“bogus”'],
    [['--instance', 'staging', 'whoami'], 'No registered instance is named “staging”'],
    [['whoami', '--instance'], '“--instance”'],
    [['whoami'], '--instance'],
    [['login', '--token-stdin', '--instance', 'http://studio.example.test'], 'https://'],
    [['--json=yes'], '“--json”'],
    [['check'], '<file>'],
    [[], 'Name a command'],
    [['--', 'check'], 'Name a command'],
  ])('stops %j with code 2 and a message that names %s', (args, named) => {
    const { status, stdout, stderr } = vignettes(args)
    expect(status).toBe(EXIT_CODES.usage)
    expect(stdout).toBe('')
    expect(stderr).toContain(named)
  })

  it('writes one JSON document on the standard output with --json, an error included', () => {
    const unknown = vignettes(['--json', '--bogus'])
    expect(unknown.status).toBe(EXIT_CODES.usage)
    expect(unknown.stderr).toBe('')
    expect(JSON.parse(unknown.stdout)).toEqual({
      ok: false,
      cli: manifest.version,
      command: null,
      instance: null,
      error: { code: 'unknown-option', message: expect.stringContaining('“--bogus”') },
    })
    expect(JSON.parse(vignettes(['check', 'deck.md', '--json']).stdout)).toMatchObject({ ok: false, command: 'check', error: { code: 'missing-file' } })
  })
})

const VALID = 'test/e2e/fixtures/decks/composants.md'
const WITH_ERRORS = 'test/unit/fixtures/composants-inconnus.md'

describe('the check command (packages/cli/src/commands/check.ts)', () => {
  it('exits with 0 without an error, 1 with an error in a deck, 2 for a missing file', () => {
    const valid = vignettes(['check', VALID])
    expect(valid).toEqual({ status: EXIT_CODES.success, stdout: '1 file checked: 0 errors, 0 warnings, 0 info.\n', stderr: '' })
    const failed = vignettes(['check', VALID, WITH_ERRORS])
    expect(failed.status).toBe(EXIT_CODES.deckError)
    expect(failed.stdout).toContain(`${WITH_ERRORS}:7:3  error  frontmatter  Value refused: this key takes a number, such as 1280.\n`)
    expect(failed.stdout).toMatch(/^2 files checked: 2 errors, 3 warnings, 0 info\.$/m)
    expect(vignettes(['check', VALID, 'absent.md'])).toEqual({ status: EXIT_CODES.usage, stdout: '', stderr: 'vignettes: The file “absent.md” does not exist.\n' })
    expect(vignettes(['check', 'test/unit/fixtures']).stderr).toContain('cannot be read')
  })

  it('reports the local images of a deck, without a control character on the terminal, and stops with 2 on a file that is not UTF-8', () => {
    const folder = mkdtempSync(join(tmpdir(), 'vignettes-images-'))
    try {
      mkdirSync(join(folder, 'decks'))
      writeFileSync(join(folder, 'decks', 'deck.md'), '---\ntitle: A\n---\n\n# B\n\n![a](./absent.png) ![b](../outside.png)\n')
      writeFileSync(join(folder, 'outside.png'), Uint8Array.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))
      writeFileSync(join(folder, 'latin.md'), Uint8Array.from([0x23, 0x20, 0xE9]))
      const run = vignettes(['check', join(folder, 'decks', 'deck.md')])
      expect(run.status).toBe(EXIT_CODES.deckError)
      expect(run.stdout).toContain('7:6  error  image-missing  No image file at “./absent.png”, read from the folder of the deck.\n')
      expect(run.stdout).toContain('7:25  error  image-outside-deck  ')
      writeFileSync(join(folder, 'decks', 'escape.md'), '---\ntitle: A\n---\n\n# B\n\n![a](./\u001B[2J.png) ![b](./a%00.png)\n')
      const escaped = vignettes(['check', join(folder, 'decks', 'escape.md')])
      expect(escaped.stdout).toContain('7:6  error  image-missing  No image file at “./[2J.png”, read from the folder of the deck.\n')
      expect(escaped.stdout).toContain('7:23  error  image-unreadable  ')
      expect([...escaped.stdout + escaped.stderr].filter(character => character < ' ' && character !== '\n')).toEqual([])
      expect(vignettes(['check', join(folder, 'latin.md')])).toMatchObject({ status: EXIT_CODES.usage, stderr: `vignettes: The file “${join(folder, 'latin.md')}” is not written in UTF-8: save it in UTF-8, the encoding the studio reads.\n` })
    }
    finally {
      rmSync(folder, { recursive: true })
    }
  })

  it('writes the problems of each file in one JSON document, the column from 0', () => {
    const { status, stdout, stderr } = vignettes(['check', '--json', VALID, WITH_ERRORS])
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
      writeFileSync(join(folder, 'image.md'), '---\ntitle: A\n---\n\n# B\n\n![a](./a.png)\n')
      writeFileSync(join(folder, 'a.png'), Uint8Array.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))
      const environment = { ...process.env, HOME: folder, XDG_CONFIG_HOME: join(folder, 'config') }
      const run = spawnSync(process.execPath, ['--import', OFFLINE, CLI, 'check', '--json', 'deck.md', 'image.md'], { cwd: folder, env: environment, encoding: 'utf8' })
      expect(run.stderr).toBe('')
      expect(run.status).toBe(EXIT_CODES.deckError)
      const [deck, image] = JSON.parse(run.stdout).results
      expect(deck.problems.length).toBeGreaterThan(0)
      expect(image).toEqual({ file: 'image.md', problems: [] })
      expect(readdirSync(folder, { recursive: true }).sort()).toEqual(['a.png', 'deck.md', 'image.md'])
    }
    finally {
      rmSync(folder, { recursive: true })
    }
  })
})

describe('the push command before its first request (packages/cli/src/commands/push.ts)', () => {
  const deck = '---\ntitle: A\n---\n\n# B\n'
  let folder: string
  const write = (name: string, text = deck) => {
    writeFileSync(join(folder, name), text)
    return join(folder, name)
  }
  // fetch throws in OFFLINE: a request would stop the command with the code 6.
  const pushed = (args: string[]) => vignettes(['push', ...args, '--instance', 'https://studio.example.test'], { VIGNETTES_TOKEN: 'vgt_made-up-secret-of-the-push-tests' })

  it.each([
    ['a slug with a dot, which check accepts', () => [write('atelier.fr.md')], '“atelier.fr” cannot be the slug'],
    ['a slug that starts with a dash', () => [write('-a.md')], 'cannot be the slug'],
    ['--slug with two files', () => [write('a.md'), write('b.md'), '--slug', 'c'], '--slug names the deck of a single file'],
    ['two files of the same slug', () => [write('a.md'), join(folder, 'sub', 'a.md')], 'Two files have the slug “a”'],
    ['two slugs that differ by case', () => [write('a.md'), join(folder, 'sub', 'A.md')], 'Two files have the slug “A”'],
    ['a folder that differs from the project key', () => [write('a.md', '---\ntitle: A\nproject: one\n---\n\n# B\n'), '--folder', 'two'], '--folder names “two” and the front matter'],
  ])('stops %s with code 2 before any request', (_, args, named) => {
    folder = mkdtempSync(join(tmpdir(), 'vignettes-push-'))
    try {
      mkdirSync(join(folder, 'sub'))
      writeFileSync(join(folder, 'sub', 'a.md'), deck)
      const run = pushed(args())
      expect(run.status).toBe(EXIT_CODES.usage)
      expect(run.stderr).toContain(named)
      if (args().includes(join(folder, 'atelier.fr.md')))
        expect(vignettes(['check', join(folder, 'atelier.fr.md')]).status).toBe(EXIT_CODES.success)
    }
    finally {
      rmSync(folder, { recursive: true })
    }
  })

  it('stops with code 2 before any request when the decks would need more than 300 requests', () => {
    folder = mkdtempSync(join(tmpdir(), 'vignettes-push-'))
    try {
      const files = Array.from({ length: 60 }, (_, index) => write(`deck-${index}.md`))
      const run = pushed(files)
      expect(run).toMatchObject({ status: EXIT_CODES.usage, stderr: expect.stringContaining('up to 302 requests') })
    }
    finally {
      rmSync(folder, { recursive: true })
    }
  })

  it('sends no request for a deck with an error, and names its problems', () => {
    folder = mkdtempSync(join(tmpdir(), 'vignettes-push-'))
    try {
      const run = pushed(['--json', write('a.md', '---\ntitle: A\n---\n\n![a](./absent.png)\n'), write('b.md')])
      expect(run.status).toBe(EXIT_CODES.deckError)
      expect(JSON.parse(run.stdout).results.map(({ action, problems }: { action: string, problems: { code: string }[] }) => [action, problems.map(problem => problem.code)])).toEqual([['refused', ['image-missing']], ['skipped', []]])
    }
    finally {
      rmSync(folder, { recursive: true })
    }
  })
})

describe('the pull command before its first request (packages/cli/src/commands/pull.ts)', () => {
  it.each([
    [['atelier.fr'], '“atelier.fr” cannot be the slug'],
    [['talk', 'Talk'], 'Two files have the slug “Talk”'],
  ])('stops %j with code 2 before any request', (slugs, named) => {
    const run = vignettes(['pull', ...slugs, '--instance', 'https://studio.example.test'], { VIGNETTES_TOKEN: 'vgt_made-up-secret-of-the-pull-tests' })
    expect(run).toMatchObject({ status: EXIT_CODES.usage, stderr: expect.stringContaining(named) })
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

describe('the outputs of a text from an instance (packages/cli/src/output.ts)', () => {
  const TEXT = 'a\u001B[2Jb\u0085c\u007Fd\te'
  const controls = (text: string) => [...text].filter(character => (character < ' ' && character !== '\n' && character !== '\t') || (character >= '\u007F' && character <= '\u009F'))
  function written(json: boolean, write: (output: ReturnType<typeof createOutput>) => void) {
    let stdout = ''
    let stderr = ''
    const out = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout += String(chunk)
      return true
    })
    const err = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderr += String(chunk)
      return true
    })
    try {
      write(createOutput({ cli: manifest.version, json, command: 'push' }))
    }
    finally {
      out.mockRestore()
      err.mockRestore()
      process.exitCode = undefined
    }
    return { stdout, stderr }
  }

  it('writes a step and an error on the standard error without their control characters', () => {
    expect(written(false, output => output.progress(TEXT)).stderr).toBe('a[2Jbcd\te\n')
    const failed = written(false, output => output.fail(new CliError('instance-redirect', 'https://studio.example.test', TEXT))).stderr
    expect(failed).toContain('a[2Jbcd\te')
    expect(controls(failed)).toEqual([])
  })

  it('escapes every control character in the JSON document', () => {
    const { stdout } = written(true, output => output.finish([{ message: TEXT }]))
    expect(controls(stdout)).toEqual([])
    expect(JSON.parse(stdout).results).toEqual([{ message: TEXT }])
    const failed = written(true, output => output.fail(new CliError('instance-redirect', 'https://studio.example.test', TEXT))).stdout
    expect(failed).toContain('\\u0085')
    expect(JSON.parse(failed).error.message).toContain(TEXT)
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
// their description in the core, the editor finds the unknown components and
// themes itself, and the problems of the files of a deck are found by the
// command line alone.
const CLI_SENTENCES = ['deck-body-too-large', 'deck-empty', 'deck-too-long', 'image-missing', 'image-not-replaced', 'image-outside-deck', 'image-source-other', 'image-too-large', 'image-type', 'image-unplaced', 'image-unread', 'image-unreadable', 'legacy', 'unknown-component', 'unknown-theme']

describe('the published package (packages/cli/package.json)', () => {
  it('publishes the built file, the README and the licence, without a dependency on a package of the workspace', () => {
    expect(manifest.files).toEqual(['LICENSE', 'README.md', 'dist'])
    const { dependencies = {}, optionalDependencies = {}, peerDependencies = {} } = manifest as Record<string, Record<string, string> | undefined>
    const published = Object.entries({ ...dependencies, ...optionalDependencies, ...peerDependencies })
    expect(published.filter(([name, version]) => name.startsWith('@vignettes/') || version.startsWith('workspace:'))).toEqual([])
  })
})

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

  it('lists every code of PROBLEM_CODES and of PUSH_PROBLEM_CODES in the README', () => {
    const codes = [...Object.values(PROBLEM_CODES).flatMap(code => typeof code === 'string' ? [code] : Object.values(code)), ...Object.keys(PUSH_PROBLEM_CODES)]
    const section = readFileSync(resolve('packages/cli/README.md'), 'utf8').split('## Codes of the problems')[1]!.split('\n## ')[0]!
    const listed = section.split('\n').filter(line => line.startsWith('- ')).flatMap(line => [...line.slice(0, line.indexOf(':')).matchAll(/`([^`]+)`/g)].map(match => match[1]))
    expect(listed.sort()).toEqual(codes.sort())
  })
})
