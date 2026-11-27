import type { CommandRun } from '../usage.ts'
import { REVOKE_TOKEN } from '../api.ts'
import { CliError } from '../messages.ts'
import { callInstance } from '../remote.ts'
import { keptSecret, openStorage, resolveInstance } from '../target.ts'

/**
 * Revokes the kept token, then erases its secret at its registered place and
 * removes the registered instance. A token the instance refuses is revoked or
 * expired already; any other failure keeps the secret, so that the command can
 * run again.
 */
export const logout: CommandRun = async ({ options, environment, output, keyring, fetch }) => {
  if (environment.token)
    throw new CliError('token-in-environment')
  const storage = await openStorage({ environment, keyring })
  const origin = await resolveInstance({ instance: options.instance as string | undefined, environment }, storage)
  output.setInstance(origin)
  const instance = await storage.instanceAt(origin)
  if (!instance)
    throw new CliError('not-signed-in', origin)
  const token = await keptSecret(storage, instance)
  if (!token) {
    await storage.forget(origin)
    output.print(`No token of ${origin} was kept on this machine: the registration of the instance is removed.`)
    return output.finish([{ instance: origin, revoked: false }])
  }
  let revoked = true
  try {
    await callInstance(REVOKE_TOKEN, { origin, token, fetch })
  }
  catch (error) {
    if (!(error instanceof CliError && error.code === 'token-refused')) {
      output.progress('The token stays on this machine: run vignettes logout again.')
      throw error
    }
    revoked = false
  }
  await storage.deleteSecret(instance)
  await storage.forget(origin)
  output.print(revoked
    ? `Signed out of ${origin}: the token is revoked, and erased from this machine.`
    : `Signed out of ${origin}: the instance had revoked the token or the token had expired, and it is erased from this machine.`)
  output.finish([{ instance: origin, revoked }])
}
