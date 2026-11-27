import type { KeyringLoader, Storage, StoredInstance } from './storage.ts'
import type { CliEnvironment } from './usage.ts'
import { CliError } from './messages.ts'

/** The hosts an instance may serve over http, on the machine itself. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

export interface TargetInput {
  /** The value of `--instance`: an origin when it holds `://`, else the name of a registered instance. */
  instance?: string
  environment: CliEnvironment
  /** The loader of @napi-rs/keyring, replaced by the tests. */
  keyring?: KeyringLoader
}

export interface Target {
  origin: string
  /** `VIGNETTES_TOKEN` when it is set, else the secret stored for the origin. */
  token: string | undefined
  storage: Storage
}

/** The origin of an address, in https, or in http on the machine itself. */
export function instanceOrigin(address: string): string {
  let url: URL
  try {
    url = new URL(address)
  }
  catch {
    throw new CliError('invalid-instance', address)
  }
  if (url.protocol === 'https:' || (url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname)))
    return url.origin
  throw new CliError('insecure-instance', address)
}

/** The storage of the machine, loaded when a command reads the registered instances or a secret. */
export async function openStorage(input: TargetInput): Promise<Storage> {
  const { createStorage } = await import('./storage.ts')
  return createStorage({ configHome: input.environment.configHome, loadKeyring: input.keyring })
}

/** The origin of the instance: `--instance`, then `VIGNETTES_INSTANCE`, then the default instance of `config.json`. */
export async function resolveInstance(input: TargetInput, storage: Storage): Promise<string> {
  const value = input.instance || input.environment.instance
  if (value?.includes('://'))
    return instanceOrigin(value)
  const config = await storage.readConfig()
  const name = value || config.default
  if (!name)
    throw new CliError('missing-instance')
  const stored = config.instances.find(instance => instance.name === name)
  if (!stored)
    throw new CliError('unknown-instance', name)
  return instanceOrigin(stored.origin)
}

/**
 * The secret kept for a registered instance; a keyring that cannot be read
 * stops the command, which keeps the secret and the registration.
 */
export async function keptSecret(storage: Storage, instance: StoredInstance): Promise<string | undefined> {
  const reading = await storage.readSecret(instance)
  if (reading.state === 'unreadable')
    throw new CliError('keyring-unreadable', instance.origin, instance.prefix)
  return reading.state === 'found' ? reading.secret : undefined
}

/**
 * The instance a command contacts and the secret it sends there; a registered
 * instance whose secret is missing from its place stops the command.
 */
export async function resolveTarget(input: TargetInput): Promise<Target> {
  const storage = await openStorage(input)
  const origin = await resolveInstance(input, storage)
  if (input.environment.token)
    return { origin, token: input.environment.token, storage }
  const instance = await storage.instanceAt(origin)
  if (!instance)
    return { origin, token: undefined, storage }
  const token = await keptSecret(storage, instance)
  if (!token)
    throw new CliError('secret-missing', origin, instance.prefix)
  return { origin, token, storage }
}
