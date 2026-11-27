import type { CommandInput, CommandName, CommandRun } from '../../../packages/cli/src/usage.ts'
import process from 'node:process'
import { vi } from 'vitest'
import manifest from '../../../packages/cli/package.json' with { type: 'json' }
import { login } from '../../../packages/cli/src/commands/login.ts'
import { logout } from '../../../packages/cli/src/commands/logout.ts'
import { push } from '../../../packages/cli/src/commands/push.ts'
import { whoami } from '../../../packages/cli/src/commands/whoami.ts'
import { createOutput } from '../../../packages/cli/src/output.ts'

const RUNS: Partial<Record<CommandName, CommandRun>> = { login, logout, whoami, push }

export type RunInput = Partial<Omit<CommandInput, 'output' | 'environment'>> & { environment?: Partial<CommandInput['environment']> }

/** Runs a command in the process as the entry point does, and gives its outputs and its exit code. */
export async function runCommand(name: 'login' | 'logout' | 'whoami' | 'push', input: RunInput = {}) {
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
  const options = input.options ?? {}
  const output = createOutput({ cli: manifest.version, json: Boolean(options.json), command: name })
  try {
    await RUNS[name]!({ operands: [], interactive: false, ...input, options, environment: { ci: false, ...input.environment }, output })
  }
  catch (error) {
    output.fail(error)
  }
  finally {
    out.mockRestore()
    err.mockRestore()
  }
  const code = process.exitCode
  process.exitCode = undefined
  return { code, stdout, stderr }
}
