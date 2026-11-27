import type { Storage, StoredInstance } from '../storage.ts'
import type { CommandRun } from '../usage.ts'
import { REVOKE_TOKEN } from '../api.ts'
import { CliError } from '../messages.ts'
import { callInstance } from '../remote.ts'
import { keptSecret, openStorage, resolveInstance } from '../target.ts'

/** Erases the secret of an instance; false when the keyring refuses, and the secret stays there. */
async function eraseSecret(storage: Storage, instance: StoredInstance): Promise<boolean> {
  try {
    await storage.deleteSecret(instance)
    return true
  }
  catch (error) {
    if (error instanceof CliError && error.code === 'secret-not-erased')
      return false
    throw error
  }
}

/**
 * Revokes the kept token, then erases its secret at its registered place and
 * removes the registered instance. A token the instance refuses is revoked or
 * expired already; any other failure keeps the secret, so that the command can
 * run again. With `--local`, removes the secret and the instance without
 * reading the secret or contacting the instance: the way out when the keyring
 * stays unreadable or the instance was shut down.
 */
export const logout: CommandRun = async ({ options, environment, output, keyring, fetch }) => {
  const local = Boolean(options.local)
  if (environment.token && !local)
    throw new CliError('token-in-environment')
  const storage = await openStorage({ environment, keyring })
  const origin = await resolveInstance({ instance: options.instance as string | undefined, environment }, storage)
  output.setInstance(origin)
  const instance = await storage.instanceAt(origin)
  if (!instance)
    throw new CliError('not-signed-in', origin)
  const result = { instance: origin, revoked: false, token: { prefix: instance.prefix } }
  const revokeIfValid = `If the token ${instance.prefix} is still valid, revoke it on the Access tokens page of the studio.`
  if (local) {
    const erased = await eraseSecret(storage, instance)
    await storage.forget(origin)
    output.progress(revokeIfValid)
    if (!erased)
      output.progress('The keyring of the system cannot erase the secret of the token, which stays there.')
    output.print(`Removed ${origin} from this machine, without contacting the instance.`)
    return output.finish([result])
  }
  const token = await keptSecret(storage, instance)
  if (!token) {
    await storage.forget(origin)
    output.progress(revokeIfValid)
    output.print(`The token of ${origin} is missing from this machine: the registration of the instance is removed.`)
    return output.finish([result])
  }
  let revoked = true
  try {
    await callInstance(REVOKE_TOKEN, { origin, token, fetch })
  }
  catch (error) {
    if (!(error instanceof CliError && error.code === 'token-refused')) {
      output.progress(`The token stays on this machine: run vignettes logout again, or vignettes logout --instance ${origin} --local if the instance was shut down.`)
      throw error
    }
    revoked = false
  }
  await storage.deleteSecret(instance)
  await storage.forget(origin)
  output.print(revoked
    ? `Signed out of ${origin}: the token is revoked, and erased from this machine.`
    : `Signed out of ${origin}: the instance had revoked the token or the token had expired, and it is erased from this machine.`)
  output.finish([{ ...result, revoked }])
}
