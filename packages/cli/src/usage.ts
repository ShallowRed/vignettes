import type { Output } from './output.ts'

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

export const COMMANDS = {
  check: {
    summary: 'Check decks for the problems the studio reports, without network and without writing a file.',
    operands: { name: 'file', required: 1, multiple: true },
    options: {},
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
