import type { CommandRun } from '../usage.ts'
import { CURRENT_TOKEN } from '../api.ts'
import { CliError } from '../messages.ts'
import { askSecret, readStandardInput } from '../prompt.ts'
import { callInstance } from '../remote.ts'
import { openStorage, resolveInstance } from '../target.ts'
import { tokenReport, tokenResult } from './whoami.ts'

/**
 * Reads a secret, checks it on the instance, keeps it and registers the
 * instance with the place of its secret. A registered instance is refused
 * without a read of the keyring, so that no token stays valid without its
 * secret on the machine.
 */
export const login: CommandRun = async ({ options, environment, interactive, output, keyring, fetch, stdin }) => {
  const fromStandardInput = Boolean(options['token-stdin'])
  if (!fromStandardInput && !interactive)
    throw new CliError('missing-token')
  const storage = await openStorage({ environment, keyring })
  const origin = await resolveInstance({ instance: options.instance as string | undefined, environment }, storage)
  output.setInstance(origin)
  const name = (options.name as string | undefined) ?? new URL(origin).host
  if (!name || name.includes('://'))
    throw new CliError('invalid-name', name)
  const { instances } = await storage.readConfig()
  if (instances.some(instance => instance.origin === origin))
    throw new CliError('already-signed-in', origin)
  const holder = instances.find(instance => instance.name === name)
  if (holder)
    throw new CliError('name-taken', name, holder.origin)

  const secret = (fromStandardInput ? await readStandardInput(stdin) : await askSecret(`Token of ${origin}`)).trim()
  if (!secret)
    throw new CliError('empty-token')
  const answer = await callInstance(CURRENT_TOKEN, { origin, token: secret, fetch })

  const place = await storage.saveSecret(origin, secret)
  if (place === 'file')
    output.progress(`The keyring of the system cannot keep the token: it is in ${storage.credentialsFile}, which your account alone can read.`)
  if (!await storage.register({ name, origin, login: answer.login, prefix: answer.prefix, store: place }))
    output.progress(`Another command rewrote ${storage.configFile} at the same time, so “${name}” is not registered: revoke the token ${answer.prefix} on the Access tokens page of the studio, then run vignettes login again.`)
  const result = { ...tokenResult(origin, answer), name, storage: place }
  output.print(`Signed in to ${origin} as “${name}”.\n${tokenReport(result)}`)
  output.finish([result])
}
