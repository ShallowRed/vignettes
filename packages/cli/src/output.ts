import type { CliErrorCode } from './messages.ts'
import type { CommandName } from './usage.ts'
import process from 'node:process'
import { CliError } from './messages.ts'

/** The exit codes of the command line, from sysexits for the internal error. */
export const EXIT_CODES = {
  success: 0,
  deckError: 1,
  usage: 2,
  authentication: 3,
  permission: 4,
  conflict: 5,
  instance: 6,
  internal: 70,
  interrupted: 130,
} as const

export type ExitCode = typeof EXIT_CODES[keyof typeof EXIT_CODES]

const ERROR_EXIT_CODES: Record<CliErrorCode, ExitCode> = {
  'missing-command': EXIT_CODES.usage,
  'unknown-command': EXIT_CODES.usage,
  'unknown-option': EXIT_CODES.usage,
  'missing-option-value': EXIT_CODES.usage,
  'unexpected-option-value': EXIT_CODES.usage,
  'unexpected-operand': EXIT_CODES.usage,
  'missing-operand': EXIT_CODES.usage,
  'missing-file': EXIT_CODES.usage,
  'unreadable-file': EXIT_CODES.usage,
  'not-utf8': EXIT_CODES.usage,
  'unwritable-file': EXIT_CODES.usage,
  'pulled-link': EXIT_CODES.usage,
  'missing-instance': EXIT_CODES.usage,
  'unknown-instance': EXIT_CODES.usage,
  'invalid-instance': EXIT_CODES.usage,
  'insecure-instance': EXIT_CODES.usage,
  'unreadable-config': EXIT_CODES.usage,
  'keyring-unreadable': EXIT_CODES.usage,
  'secret-not-erased': EXIT_CODES.usage,
  'secret-missing': EXIT_CODES.usage,
  'registration-lost': EXIT_CODES.usage,
  'missing-token': EXIT_CODES.usage,
  'empty-token': EXIT_CODES.usage,
  'invalid-name': EXIT_CODES.usage,
  'name-taken': EXIT_CODES.usage,
  'already-signed-in': EXIT_CODES.usage,
  'not-signed-in': EXIT_CODES.usage,
  'not-registered': EXIT_CODES.usage,
  'token-in-environment': EXIT_CODES.usage,
  'token-refused': EXIT_CODES.authentication,
  'token-forbidden': EXIT_CODES.permission,
  'route-unknown': EXIT_CODES.instance,
  'instance-redirect': EXIT_CODES.instance,
  'instance-unreachable': EXIT_CODES.instance,
  'instance-error': EXIT_CODES.instance,
  'instance-answer': EXIT_CODES.instance,
  'invalid-slug': EXIT_CODES.usage,
  'duplicate-slug': EXIT_CODES.usage,
  'slug-with-files': EXIT_CODES.usage,
  'folder-differs': EXIT_CODES.usage,
  'too-many-requests-planned': EXIT_CODES.usage,
  'read-scope': EXIT_CODES.permission,
  'folder-required': EXIT_CODES.usage,
  'folder-refused': EXIT_CODES.permission,
  'replaced-copy-differs': EXIT_CODES.usage,
  'too-many-token-requests': EXIT_CODES.instance,
  'too-many-invalid-tokens': EXIT_CODES.authentication,
  'digest-unchecked': EXIT_CODES.instance,
  'media-name-differs': EXIT_CODES.instance,
  'internal': EXIT_CODES.internal,
  'interrupted': EXIT_CODES.interrupted,
}

/** An error of the command line as it stands, any other error as an internal error. */
export function asCliError(error: unknown): CliError {
  return error instanceof CliError ? error : new CliError('internal', error instanceof Error ? error.message : String(error))
}

export function exitCodeOf(error: unknown): ExitCode {
  return ERROR_EXIT_CODES[asCliError(error).code]
}

// The C0 and C1 control characters but the tab and the line feed: ESC opens
// an escape sequence of the terminal, and a deck or an instance may write one.
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g

/** A text without its control characters, as the command line writes it on the terminal. */
const withoutControls = (text: string) => text.replace(CONTROL_RE, '')

/** A command asks a question only in a terminal, outside the CI and without `--json`. */
export function isInteractive(mode: { json: boolean, stdinIsTTY: boolean, ci: boolean }): boolean {
  return !mode.json && mode.stdinIsTTY && !mode.ci
}

export interface ResultDocument {
  ok: boolean
  cli: string
  command: CommandName | null
  instance: string | null
  results: unknown[]
}

export interface ErrorDocument {
  ok: false
  cli: string
  command: CommandName | null
  instance: string | null
  error: { code: CliErrorCode, message: string }
}

export interface Output {
  /** A step of the command, on the standard error. */
  progress: (text: string) => void
  /** The text of the result, on the standard output, without `--json`. */
  print: (text: string) => void
  /** Ends the command: the JSON document with `--json`, and the exit code. */
  finish: (results: unknown[], exitCode?: ExitCode) => void
  /** Ends the command with an error: its document with `--json`, else its message on the standard error. */
  fail: (error: unknown) => void
  /** Ends the process at once after Ctrl+C. */
  interrupt: () => never
  /** Names the instance the command contacts, in the JSON document. */
  setInstance: (origin: string) => void
}

export function createOutput(options: { cli: string, json: boolean, command: CommandName | null }): Output {
  const { cli, json, command } = options
  let instance: string | null = null
  // JSON.stringify escapes the C0 characters alone: the document escapes DEL and the C1 ones too.
  const writeDocument = (document: ResultDocument | ErrorDocument) => process.stdout.write(`${JSON.stringify(document).replace(/[\u007F-\u009F]/g, character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`)}\n`)
  const fail = (error: unknown) => {
    const { code, message } = asCliError(error)
    if (json)
      writeDocument({ ok: false, cli, command, instance, error: { code, message } })
    else
      process.stderr.write(`vignettes: ${withoutControls(message)}\n`)
    process.exitCode = exitCodeOf(error)
  }
  return {
    progress: text => process.stderr.write(`${withoutControls(text)}\n`),
    print: (text) => {
      if (!json)
        process.stdout.write(withoutControls(text.endsWith('\n') ? text : `${text}\n`))
    },
    finish: (results, exitCode = EXIT_CODES.success) => {
      if (json)
        writeDocument({ ok: exitCode === EXIT_CODES.success, cli, command, instance, results })
      process.exitCode = exitCode
    },
    fail,
    interrupt: () => {
      fail(new CliError('interrupted'))
      process.exit(EXIT_CODES.interrupted)
    },
    setInstance: (origin) => {
      instance = origin
    },
  }
}

/** The help or the version, as text whatever the mode. */
export function printText(text: string): void {
  process.stdout.write(text.endsWith('\n') ? text : `${text}\n`)
  process.exitCode = EXIT_CODES.success
}
