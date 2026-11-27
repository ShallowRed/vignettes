import type { CurrentToken } from '../api.ts'
import type { CommandRun } from '../usage.ts'
import { CURRENT_TOKEN } from '../api.ts'
import { CliError } from '../messages.ts'
import { callInstance } from '../remote.ts'
import { resolveTarget } from '../target.ts'

/** The account and the token of an answer of `GET /api/tokens/current`, in the `--json` document. */
export function tokenResult(origin: string, { login, role, name, prefix, scope, expiresAt }: CurrentToken) {
  return { instance: origin, login, role, token: { name, prefix, scope, expiresAt } }
}

export function tokenReport(result: ReturnType<typeof tokenResult>): string {
  return [
    `Instance  ${result.instance}`,
    `Account   ${result.login}`,
    `Role      ${result.role}`,
    `Scope     ${result.token.scope}`,
    `Token     ${result.token.prefix} (${result.token.name})`,
    `Expires   ${result.token.expiresAt}`,
  ].join('\n')
}

/** Shows the account and the token the instance reads in the secret of the target. */
export const whoami: CommandRun = async ({ options, environment, output, keyring, fetch }) => {
  const { origin, token } = await resolveTarget({ instance: options.instance as string | undefined, environment, keyring })
  output.setInstance(origin)
  if (!token)
    throw new CliError('not-signed-in', origin)
  const result = tokenResult(origin, await callInstance(CURRENT_TOKEN, { origin, token, fetch }))
  output.print(tokenReport(result))
  output.finish([result])
}
