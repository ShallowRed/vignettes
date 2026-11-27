import type { Output } from './output.ts'
import type { KeyringLoader } from './storage.ts'

export interface OptionUsage {
  type: 'boolean' | 'string'
  /** The name of the value in the help, for a string option. */
  value?: string
  description: string
}

export interface CommandUsage {
  summary: string
  /** The operands after the command, in the help; `required` gives the fewest the command takes. */
  operands?: { name: string, required: number, multiple: boolean }
  options: Record<string, OptionUsage>
}

/** The options every command accepts, and the command line without a command. */
export const COMMON_OPTIONS = {
  json: { type: 'boolean', description: 'Write one JSON document on the standard output.' },
  help: { type: 'boolean', description: 'Show the help.' },
  version: { type: 'boolean', description: 'Show the version of the command line.' },
} as const satisfies Record<string, OptionUsage>

const INSTANCE_OPTION = {
  type: 'string',
  value: 'origin or name',
  description: 'The origin of the instance, or the name login registered it under; without it, VIGNETTES_INSTANCE, then the default instance.',
} as const satisfies OptionUsage

export const COMMANDS = {
  check: {
    summary: 'Check decks for the problems the studio reports, without network and without writing a file.',
    operands: { name: 'file', required: 1, multiple: true },
    options: {},
  },
  login: {
    summary: 'Sign in to an instance with a personal token: check the token, keep it on this machine and register the instance.',
    options: {
      'instance': INSTANCE_OPTION,
      'name': { type: 'string', value: 'name', description: 'The name to register the instance under, for --instance and VIGNETTES_INSTANCE; its host by default.' },
      'token-stdin': { type: 'boolean', description: 'Read the token from the standard input, without a question.' },
    },
  },
  logout: {
    summary: 'Revoke the token kept for an instance, then erase it from this machine.',
    options: {
      instance: INSTANCE_OPTION,
      local: { type: 'boolean', description: 'Remove the instance and its token from this machine without contacting the instance: the token stays valid until you revoke it in the studio.' },
    },
  },
  whoami: {
    summary: 'Show the instance, the account and the token the command line uses.',
    options: { instance: INSTANCE_OPTION },
  },
  push: {
    summary: 'Check decks, then send them with their local images to an instance and publish them.',
    operands: { name: 'file', required: 1, multiple: true },
    options: {
      'slug': { type: 'string', value: 'slug', description: 'The slug of the deck of a single file; the name of the file without .md by default.' },
      'folder': { type: 'string', value: 'folder', description: 'The folder of a deck the command creates; the project key of the front matter by default.' },
      'dry-run': { type: 'boolean', description: 'Read the instance and show what the command would write, without writing.' },
      'force': { type: 'boolean', description: 'Publish over a draft this command did not send, after a copy of that draft beside the file.' },
      'instance': INSTANCE_OPTION,
    },
  },
} as const satisfies Record<string, CommandUsage>

export type CommandName = keyof typeof COMMANDS

export function isCommandName(name: string): name is CommandName {
  return Object.hasOwn(COMMANDS, name)
}

/** The environment variables a command reads, passed by the entry point. */
export interface CliEnvironment {
  instance?: string
  token?: string
  configHome?: string
  ci: boolean
}

export interface CommandInput {
  operands: string[]
  options: Record<string, string | boolean | undefined>
  environment: CliEnvironment
  /** False with `--json`, without a terminal on the standard input, or with `CI` set: the command asks no question. */
  interactive: boolean
  output: Output
  /** The `fetch` of Node, the keyring and the standard input, replaced by the tests. */
  fetch?: typeof fetch
  keyring?: KeyringLoader
  stdin?: NodeJS.ReadableStream
}

export type CommandRun = (input: CommandInput) => Promise<void>

function optionLines(options: Record<string, OptionUsage>): string[] {
  const entries = Object.entries(options).map(([name, option]) => [`--${name}${option.value ? ` <${option.value}>` : ''}`, option.description] as const)
  const width = Math.max(...entries.map(([flag]) => flag.length))
  return entries.map(([flag, description]) => `  ${flag.padEnd(width)}  ${description}`)
}

function operandText(operands: CommandUsage['operands']): string {
  if (!operands)
    return ''
  const name = `<${operands.name}${operands.multiple ? '…' : ''}>`
  return ` ${operands.required > 0 ? name : `[${name}]`}`
}

export function commandHelp(name: CommandName): string {
  const command: CommandUsage = COMMANDS[name]
  const options = { ...command.options, ...COMMON_OPTIONS }
  return [
    `Usage: vignettes ${name}${operandText(command.operands)} [options]`,
    '',
    command.summary,
    '',
    'Options:',
    ...optionLines(options),
    '',
  ].join('\n')
}

export function mainHelp(): string {
  const width = Math.max(...Object.keys(COMMANDS).map(name => name.length))
  return [
    'Usage: vignettes <command> [options]',
    '',
    'Commands:',
    ...Object.entries(COMMANDS).map(([name, command]) => `  ${name.padEnd(width)}  ${command.summary}`),
    '',
    'Options:',
    ...optionLines(COMMON_OPTIONS),
    '',
    'Run vignettes <command> --help for the options of a command.',
    '',
  ].join('\n')
}
