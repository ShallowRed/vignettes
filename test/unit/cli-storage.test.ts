import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createStorage } from '../../packages/cli/src/storage.ts'
import { fakeKeyring } from './helpers/keyring'

vi.mock('node:fs/promises', async (actual) => {
  const module = await actual<typeof import('node:fs/promises')>()
  return { ...module, open: vi.fn(module.open), rename: vi.fn(module.rename) }
})

// A secret made up for the tests.
const SECRET = 'vgt_test-secret-of-the-storage-tests'
const ORIGIN = 'https://studio.example.test'

let home: string
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'vignettes-storage-'))
})
afterEach(() => {
  rmSync(home, { recursive: true })
  vi.mocked(fs.open).mockClear()
})

const registration = (store: 'keyring' | 'file', name = 'studio', origin = ORIGIN) => ({ name, origin, login: 'ann', prefix: 'vgt_abcdefgh', store })
const mode = (path: string) => statSync(path).mode & 0o777
const read = (path: string) => readFileSync(path, 'utf8')

describe('the secrets (packages/cli/src/storage.ts)', () => {
  it('keeps a secret in the keyring, and none in a file', async () => {
    const keyring = fakeKeyring()
    const storage = createStorage({ configHome: home, loadKeyring: keyring.load })
    await expect(storage.saveSecret(ORIGIN, SECRET)).resolves.toBe('keyring')
    expect(keyring.passwords.get(`vignettes/${ORIGIN}`)).toBe(SECRET)
    await expect(storage.readSecret(registration('keyring'))).resolves.toEqual({ state: 'found', secret: SECRET })
    expect(readdirSync(home, { recursive: true })).toEqual([])
    await storage.deleteSecret(registration('keyring'))
    expect(keyring.passwords.size).toBe(0)
  })

  it.each(['missing-module', 'no-secret-service', 'locked'] as const)('writes the secret to credentials.json in mode 0600 when the keyring fails: %s', async (failure) => {
    const storage = createStorage({ configHome: home, loadKeyring: fakeKeyring(failure).load })
    await expect(storage.saveSecret(ORIGIN, SECRET)).resolves.toBe('file')
    expect(storage.credentialsFile).toBe(join(home, 'vignettes', 'credentials.json'))
    expect(JSON.parse(read(storage.credentialsFile))).toEqual({ [ORIGIN]: SECRET })
    expect(mode(storage.credentialsFile)).toBe(0o600)
    expect(mode(storage.folder)).toBe(0o700)
    await expect(storage.readSecret(registration('file'))).resolves.toEqual({ state: 'found', secret: SECRET })
    await storage.deleteSecret(registration('file'))
    await expect(storage.readSecret(registration('file'))).resolves.toEqual({ state: 'absent' })
    expect(readdirSync(storage.folder)).toEqual([])
  })

  it.each(['missing-module', 'no-secret-service', 'locked'] as const)('reads a secret registered in the keyring there alone, and calls a failing keyring unreadable: %s', async (failure) => {
    await createStorage({ configHome: home, loadKeyring: fakeKeyring('locked').load }).saveSecret(ORIGIN, SECRET)
    const storage = createStorage({ configHome: home, loadKeyring: fakeKeyring(failure).load })
    await expect(storage.readSecret(registration('keyring'))).resolves.toEqual({ state: 'unreadable' })
    await expect(storage.deleteSecret(registration('keyring'))).rejects.toMatchObject({ code: 'secret-not-erased' })
    expect(JSON.parse(read(storage.credentialsFile))).toEqual({ [ORIGIN]: SECRET })
  })

  it('tells a secret absent from a keyring that reads', async () => {
    await createStorage({ configHome: home, loadKeyring: fakeKeyring('locked').load }).saveSecret(ORIGIN, SECRET)
    const storage = createStorage({ configHome: home, loadKeyring: fakeKeyring().load })
    await expect(storage.readSecret(registration('keyring'))).resolves.toEqual({ state: 'absent' })
  })

  it('reads a keyring locked between the write and the read as unreadable, and reads it again once unlocked', async () => {
    const keyring = fakeKeyring()
    const storage = createStorage({ configHome: home, loadKeyring: keyring.load })
    await storage.saveSecret(ORIGIN, SECRET)
    keyring.lock()
    await expect(storage.readSecret(registration('keyring'))).resolves.toEqual({ state: 'unreadable' })
    keyring.unlock()
    await expect(storage.readSecret(registration('keyring'))).resolves.toEqual({ state: 'found', secret: SECRET })
  })

  it('writes through a temporary file created in mode 0600, then renames it', async () => {
    const storage = createStorage({ configHome: home, loadKeyring: fakeKeyring('locked').load })
    await storage.saveSecret(ORIGIN, SECRET)
    expect(vi.mocked(fs.open)).toHaveBeenCalledWith(expect.stringMatching(/\/\.credentials\.json\.[\w-]+\.tmp$/), 'wx', 0o600)
    expect(readdirSync(storage.folder)).toEqual(['credentials.json'])
  })
})

describe('the registered instances (packages/cli/src/storage.ts)', () => {
  it('makes the first instance the default, with the place of its secret and no secret', async () => {
    const storage = createStorage({ configHome: home, loadKeyring: fakeKeyring('locked').load })
    await storage.saveSecret(ORIGIN, SECRET)
    await expect(storage.register(registration('file'))).resolves.toBe(true)
    await storage.register(registration('keyring', 'local', 'http://localhost:3000'))
    expect(storage.configFile).toBe(join(home, 'vignettes', 'config.json'))
    expect(JSON.parse(read(storage.configFile))).toEqual({ default: 'studio', instances: [registration('file'), registration('keyring', 'local', 'http://localhost:3000')] })
    expect(read(storage.configFile)).not.toContain(SECRET)
    expect(mode(storage.configFile)).toBe(0o600)
    await expect(storage.instanceAt(ORIGIN)).resolves.toEqual(registration('file'))

    await storage.forget(ORIGIN)
    await expect(storage.readConfig()).resolves.toEqual({ instances: [registration('keyring', 'local', 'http://localhost:3000')] })
  })

  it('tells when another command replaced config.json after its write', async () => {
    const storage = createStorage({ configHome: home, loadKeyring: fakeKeyring().load })
    vi.mocked(fs.rename).mockImplementationOnce(async (from, to) => {
      await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises').then(module => module.rename(from, to))
      writeFileSync(storage.configFile, JSON.stringify({ default: 'other', instances: [registration('keyring', 'other', 'https://other.example.test')] }))
    })
    await expect(storage.register(registration('keyring'))).resolves.toBe(false)
  })

  it('stops with code 2 on a config.json it cannot read', async () => {
    const storage = createStorage({ configHome: home, loadKeyring: fakeKeyring().load })
    await storage.register(registration('keyring'))
    writeFileSync(storage.configFile, '{ "instances": 1 }')
    await expect(storage.readConfig()).rejects.toMatchObject({ code: 'unreadable-config' })
  })

  it('reads $XDG_CONFIG_HOME when it is absolute, ~/.config otherwise', () => {
    expect(createStorage({ configHome: home }).folder).toBe(join(home, 'vignettes'))
    expect(createStorage({ configHome: 'relative' }).folder).toBe(join(homedir(), '.config', 'vignettes'))
    expect(createStorage({}).folder).toBe(join(homedir(), '.config', 'vignettes'))
  })
})
