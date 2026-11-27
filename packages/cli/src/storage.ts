import { randomUUID } from 'node:crypto'
import { chmod, mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join } from 'node:path'
import { z } from 'zod'
import { CliError } from './messages.ts'

/** The part of `Entry` of @napi-rs/keyring that the command line uses. */
interface KeyringEntry {
  getPassword: () => string | null
  setPassword: (password: string) => void
  deletePassword: () => boolean
}

export interface Keyring {
  Entry: new (service: string, account: string, options?: { linux?: { store?: 'secret-service' } }) => KeyringEntry
}

export type KeyringLoader = () => Promise<Keyring>

const loadSystemKeyring: KeyringLoader = () => import('@napi-rs/keyring')

const KEYRING_SERVICE = 'vignettes'

const StoredInstanceSchema = z.object({
  name: z.string(),
  origin: z.string(),
  login: z.string(),
  prefix: z.string(),
  store: z.enum(['keyring', 'file']),
})

const ConfigSchema = z.object({
  default: z.string().optional(),
  instances: z.array(StoredInstanceSchema),
})

const CredentialsSchema = z.record(z.string(), z.string())

/** An instance `login` registered: no secret; the prefix names its token, `store` the place of its secret. */
export type StoredInstance = z.infer<typeof StoredInstanceSchema>

/** The content of `config.json`; `default` is the name of the default instance. */
export type CliConfig = z.infer<typeof ConfigSchema>

/** Where `saveSecret` put a secret. */
export type SecretPlace = StoredInstance['store']

/** A secret read at its registered place; `unreadable`: the keyring failed, and may still hold the secret. */
export type SecretReading = { state: 'found', secret: string } | { state: 'absent' } | { state: 'unreadable' }

export interface Storage {
  readonly folder: string
  readonly configFile: string
  readonly credentialsFile: string
  readConfig: () => Promise<CliConfig>
  /** The registered instance of an origin. */
  instanceAt: (origin: string) => Promise<StoredInstance | undefined>
  /** Adds or replaces the instance of the same origin, and reads the file again: false when another write dropped it. */
  register: (instance: StoredInstance) => Promise<boolean>
  forget: (origin: string) => Promise<void>
  /** The secret of an instance, read at the place it registers alone. */
  readSecret: (instance: StoredInstance) => Promise<SecretReading>
  /** Writes to the keyring, or to `credentials.json` when the keyring fails, whatever the error. */
  saveSecret: (origin: string, secret: string) => Promise<SecretPlace>
  /** Erases the secret of an instance at its registered place; a keyring that fails stops the command. */
  deleteSecret: (instance: StoredInstance) => Promise<void>
}

/** `$XDG_CONFIG_HOME/vignettes`, `~/.config/vignettes` when the variable is unset or relative. */
function configFolder(configHome: string | undefined): string {
  return join(configHome && isAbsolute(configHome) ? configHome : join(homedir(), '.config'), 'vignettes')
}

async function readJson<T>(file: string, schema: z.ZodType<T>, empty: T): Promise<T> {
  let text: string
  try {
    text = await readFile(file, 'utf8')
  }
  catch (error) {
    if ((error as { code?: string }).code === 'ENOENT')
      return empty
    throw new CliError('unreadable-config', file)
  }
  try {
    return schema.parse(JSON.parse(text))
  }
  catch {
    throw new CliError('unreadable-config', file)
  }
}

/** Writes through a temporary file created in mode 0600, then a rename: a reader never sees a truncated file. */
async function writePrivate(file: string, value: unknown): Promise<void> {
  const folder = dirname(file)
  await mkdir(folder, { recursive: true, mode: 0o700 })
  await chmod(folder, 0o700)
  const temporary = join(folder, `.${basename(file)}.${randomUUID()}.tmp`)
  const handle = await open(temporary, 'wx', 0o600)
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`)
    await handle.close()
    await rename(temporary, file)
  }
  catch (error) {
    await handle.close().catch(() => {})
    await rm(temporary, { force: true })
    throw error
  }
}

export function createStorage(options: { configHome?: string, loadKeyring?: KeyringLoader }): Storage {
  const folder = configFolder(options.configHome)
  const configFile = join(folder, 'config.json')
  const credentialsFile = join(folder, 'credentials.json')
  const loadKeyring = options.loadKeyring ?? loadSystemKeyring

  const readConfig = () => readJson(configFile, ConfigSchema, { instances: [] })
  const readCredentials = () => readJson(credentialsFile, CredentialsSchema, {})

  async function writeCredentials(credentials: Record<string, string>): Promise<void> {
    if (Object.keys(credentials).length > 0)
      await writePrivate(credentialsFile, credentials)
    else
      await rm(credentialsFile, { force: true })
  }

  async function dropFileSecret(origin: string): Promise<void> {
    const credentials = await readCredentials()
    if (!Object.hasOwn(credentials, origin))
      return
    delete credentials[origin]
    await writeCredentials(credentials)
  }

  async function entry(origin: string): Promise<KeyringEntry> {
    const { Entry } = await loadKeyring()
    return new Entry(KEYRING_SERVICE, origin, { linux: { store: 'secret-service' } })
  }

  return {
    folder,
    configFile,
    credentialsFile,
    readConfig,
    instanceAt: async origin => (await readConfig()).instances.find(instance => instance.origin === origin),
    async register(instance) {
      const config = await readConfig()
      const instances = [...config.instances.filter(stored => stored.origin !== instance.origin), instance]
      await writePrivate(configFile, { default: config.default ?? instance.name, instances })
      return (await readConfig()).instances.some(stored => stored.origin === instance.origin)
    },
    async forget(origin) {
      const config = await readConfig()
      const forgotten = config.instances.find(stored => stored.origin === origin)
      if (!forgotten)
        return
      const instances = config.instances.filter(stored => stored !== forgotten)
      await writePrivate(configFile, { default: config.default === forgotten.name ? undefined : config.default, instances })
    },
    async readSecret({ origin, store }) {
      let secret: string | null | undefined
      if (store === 'file') {
        secret = (await readCredentials())[origin]
      }
      else {
        try {
          secret = (await entry(origin)).getPassword()
        }
        catch {
          return { state: 'unreadable' }
        }
      }
      return secret ? { state: 'found', secret } : { state: 'absent' }
    },
    async saveSecret(origin, secret) {
      try {
        ;(await entry(origin)).setPassword(secret)
        return 'keyring'
      }
      catch {
        await writePrivate(credentialsFile, { ...await readCredentials(), [origin]: secret })
        return 'file'
      }
    },
    async deleteSecret({ origin, store }) {
      if (store === 'file')
        return dropFileSecret(origin)
      try {
        ;(await entry(origin)).deletePassword()
      }
      catch {
        throw new CliError('secret-not-erased', origin)
      }
    },
  }
}
