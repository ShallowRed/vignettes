#!/usr/bin/env node
import type { ParseArgsOptionsConfig } from 'node:util'
import type { CliEnvironment, CommandInput, CommandName, CommandRun, CommandUsage, OptionUsage } from './usage.ts'
import process from 'node:process'
import { parseArgs } from 'node:util'
import manifest from '../package.json' with { type: 'json' }
import { check } from './commands/check.ts'
import { CliError } from './messages.ts'
import { createOutput, isInteractive, printText } from './output.ts'
import { commandHelp, COMMANDS, COMMON_OPTIONS, isCommandName, mainHelp } from './usage.ts'

const RUNS: Record<CommandName, CommandRun> = { check }

function parseConfig(options: Record<string, OptionUsage>): ParseArgsOptionsConfig {
  return Object.fromEntries(Object.entries(options).map(([name, { type }]) => [name, { type }]))
}

/** The error of a strict reading, naming the option or the argument it refuses. */
function usageError(error: unknown, args: string[], options: ParseArgsOptionsConfig): unknown {
  const code = (error as { code?: string }).code
  const { tokens } = parseArgs({ args, options, strict: false, allowPositionals: true, tokens: true })
  if (code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION') {
    const token = tokens.find(token => token.kind === 'option' && !Object.hasOwn(options, token.name))
    return new CliError('unknown-option', token?.kind === 'option' ? token.rawName : '')
  }
  if (code === 'ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL') {
    const token = tokens.find(token => token.kind === 'positional')
    return new CliError('unexpected-operand', token?.kind === 'positional' ? token.value : '')
  }
  if (code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE') {
    for (const token of tokens) {
      const type = token.kind === 'option' ? options[token.name]?.type : undefined
      if (token.kind !== 'option' || !type)
        continue
      if (type === 'string' && (token.value === undefined || token.value.startsWith('-')))
        return new CliError('missing-option-value', token.rawName)
      if (type === 'boolean' && token.value !== undefined)
        return new CliError('unexpected-option-value', token.rawName)
    }
  }
  return error
}

/** The options written `--name value`, whose value the search of the command skips. */
const VALUED_OPTIONS = new Set(Object.values(COMMANDS as Record<string, CommandUsage>).flatMap(({ options }) =>
  Object.entries(options).filter(([, option]) => option.type === 'string').map(([name]) => `--${name}`)))

/** The index of the first argument that is neither an option nor the value of one, before `--`. */
function commandIndex(args: string[]): number {
  let value = false
  for (const [index, arg] of args.entries()) {
    if (arg === '--')
      break
    if (!value && !arg.startsWith('-'))
      return index
    value = !value && VALUED_OPTIONS.has(arg)
  }
  return -1
}

async function main(args: string[], environment: CliEnvironment): Promise<void> {
  const at = commandIndex(args)
  const name = at === -1 ? undefined : args[at]
  const command = name && isCommandName(name) ? name : null
  const output = createOutput({ cli: manifest.version, json: args.includes('--json'), command })
  process.once('SIGINT', () => output.interrupt())
  try {
    if (name && !command)
      throw new CliError('unknown-command', name)
    const usage: CommandUsage = command ? COMMANDS[command] : { summary: '', options: {} }
    const options = parseConfig({ ...usage.options, ...COMMON_OPTIONS })
    const rest = command ? args.toSpliced(at, 1) : args
    let parsed
    try {
      parsed = parseArgs({ args: rest, options, strict: true, allowPositionals: Boolean(usage.operands) })
    }
    catch (error) {
      const refused = usageError(error, rest, options)
      // Without a command, an argument comes after `--`.
      throw !command && refused instanceof CliError && refused.code === 'unexpected-operand' ? new CliError('missing-command') : refused
    }
    const { values, positionals } = parsed
    if (values.version)
      return printText(manifest.version)
    if (values.help)
      return printText(command ? commandHelp(command) : mainHelp())
    if (!command)
      throw new CliError('missing-command')
    if (usage.operands && positionals.length < usage.operands.required)
      throw new CliError('missing-operand', usage.operands.name)
    await RUNS[command]({
      operands: positionals,
      // No option takes several values.
      options: values as CommandInput['options'],
      environment,
      interactive: isInteractive({ json: Boolean(values.json), stdinIsTTY: Boolean(process.stdin.isTTY), ci: environment.ci }),
      output,
    })
  }
  catch (error) {
    output.fail(error)
  }
}

const { env } = process
void main(process.argv.slice(2), {
  instance: env.VIGNETTES_INSTANCE,
  token: env.VIGNETTES_TOKEN,
  configHome: env.XDG_CONFIG_HOME,
  ci: Boolean(env.CI),
})
