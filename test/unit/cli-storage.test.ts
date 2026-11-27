import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EXIT_CODES } from '../../packages/cli/src/output.ts'
import { createStorage } from '../../packages/cli/src/storage.ts'
import { runCommand } from './helpers/cli-run'
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

  it('removes an earlier secret of the origin from credentials.json when the keyring keeps the new one', async () => {
    await createStorage({ configHome: home, loadKeyring: fakeKeyring('locked').load }).saveSecret(ORIGIN, 'vgt_an-earlier-made-up-secret')
    const keyring = fakeKeyring()
    const storage = createStorage({ configHome: home, loadKeyring: keyring.load })
    await expect(storage.saveSecret(ORIGIN, SECRET)).resolves.toBe('keyring')
    expect(keyring.passwords.get(`vignettes/${ORIGIN}`)).toBe(SECRET)
    expect(readdirSync(storage.folder)).toEqual([])
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

describe('login, whoami and logout on the kept secrets (packages/cli/src/commands)', () => {
  const answer = (secret: string) => Response.json({ login: 'ann', role: 'editor', name: 'CLI', prefix: secret.slice(0, 12), scope: 'read', expiresAt: '2027-01-01T00:00:00.000Z' })
  const OTHER = 'vgt_another-made-up-secret-of-the-tests'

  async function signIn(keyring: ReturnType<typeof fakeKeyring>, secret = SECRET) {
    const signedIn = await runCommand('login', { keyring: keyring.load, fetch: async () => answer(secret), stdin: Readable.from([secret]), options: { 'instance': ORIGIN, 'token-stdin': true }, environment: { configHome: home } })
    expect(signedIn.code).toBe(EXIT_CODES.success)
  }

  it.each([undefined, 'locked'] as const)('refuses login on an instance whose secret is kept, keyring %s, without reading the keyring or a secret', async (failure) => {
    const keyring = fakeKeyring()
    await signIn(keyring)
    if (failure)
      keyring.lock()
    const fetch = vi.fn<typeof globalThis.fetch>()
    const stdin = Readable.from([OTHER])
    const refused = await runCommand('login', { fetch, keyring: keyring.load, stdin, options: { 'instance': ORIGIN, 'token-stdin': true }, environment: { configHome: home } })
    expect(refused).toMatchObject({ code: EXIT_CODES.usage, stderr: expect.stringContaining('run vignettes logout --instance https://studio.example.test first') })
    expect(fetch).not.toHaveBeenCalled()
    expect(stdin.readableDidRead).toBe(false)
    expect(readdirSync(join(home, 'vignettes'))).toEqual(['config.json'])
    keyring.unlock()
    expect(keyring.passwords.get(`vignettes/${ORIGIN}`)).toBe(SECRET)
  })

  it('stops logout and whoami with code 2 while the keyring that holds the secret is locked, without calling the instance', async () => {
    const keyring = fakeKeyring()
    await signIn(keyring)
    keyring.lock()
    const fetch = vi.fn<typeof globalThis.fetch>()
    for (const name of ['logout', 'whoami'] as const) {
      const stopped = await runCommand(name, { fetch, keyring: keyring.load, environment: { configHome: home } })
      expect(stopped).toMatchObject({ code: EXIT_CODES.usage, stdout: '', stderr: expect.stringContaining('cannot be read: unlock it') })
    }
    expect(fetch).not.toHaveBeenCalled()

    keyring.unlock()
    const revoked = vi.fn(async () => Response.json({ action: 'revoked' }))
    await expect(runCommand('logout', { fetch: revoked, keyring: keyring.load, environment: { configHome: home } })).resolves.toMatchObject({ code: EXIT_CODES.success })
    expect(revoked).toHaveBeenCalledOnce()
    expect(keyring.passwords.size).toBe(0)
  })

  it('removes the instance with logout --local while the keyring stays locked, without calling the instance, then signs in again', async () => {
    const keyring = fakeKeyring()
    await signIn(keyring)
    keyring.lock()
    const fetch = vi.fn<typeof globalThis.fetch>()
    const removed = await runCommand('logout', { fetch, keyring: keyring.load, options: { local: true, json: true }, environment: { configHome: home, token: OTHER } })
    expect(removed.code).toBe(EXIT_CODES.success)
    expect(JSON.parse(removed.stdout)).toMatchObject({ ok: true, instance: ORIGIN, results: [{ instance: ORIGIN, revoked: false, token: { prefix: 'vgt_test-sec' } }] })
    expect(removed.stderr).toContain('If the token vgt_test-sec is still valid, revoke it on the Access tokens page of the studio.')
    expect(removed.stderr).toContain('cannot erase the secret of the token, which stays there')
    expect(fetch).not.toHaveBeenCalled()
    await expect(createStorage({ configHome: home }).readConfig()).resolves.toEqual({ instances: [] })

    await signIn(keyring, OTHER)
    await expect(createStorage({ configHome: home }).instanceAt(ORIGIN)).resolves.toMatchObject({ store: 'file', prefix: 'vgt_another-' })
  })

  it('erases the secret kept in credentials.json with logout --local', async () => {
    const keyring = fakeKeyring('locked')
    await signIn(keyring)
    const removed = await runCommand('logout', { keyring: keyring.load, options: { local: true }, environment: { configHome: home } })
    expect(removed).toMatchObject({ code: EXIT_CODES.success, stdout: 'Removed https://studio.example.test from this machine, without contacting the instance.\n' })
    expect(removed.stderr).not.toContain('cannot erase')
    expect(readdirSync(join(home, 'vignettes'))).toEqual(['config.json'])
    await expect(runCommand('logout', { keyring: keyring.load, options: { local: true, instance: ORIGIN }, environment: { configHome: home } })).resolves.toMatchObject({ code: EXIT_CODES.usage, stderr: expect.stringContaining('No instance “https://studio.example.test” is registered on this machine.') })
  })

  it('stops login with code 2 and erases the secret when another command drops the registration', async () => {
    const keyring = fakeKeyring()
    vi.mocked(fs.rename).mockImplementationOnce(async (from, to) => {
      await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises').then(module => module.rename(from, to))
      writeFileSync(String(to), JSON.stringify({ instances: [] }))
    })
    const lost = await runCommand('login', { keyring: keyring.load, fetch: async () => answer(SECRET), stdin: Readable.from([SECRET]), options: { 'instance': ORIGIN, 'token-stdin': true, 'json': true }, environment: { configHome: home } })
    expect(lost.code).toBe(EXIT_CODES.usage)
    expect(JSON.parse(lost.stdout)).toMatchObject({ ok: false, error: { code: 'registration-lost', message: expect.stringContaining('revoke the token vgt_test-sec on the Access tokens page') } })
    expect(keyring.passwords.size).toBe(0)
  })

  it('stops logout when the keyring cannot erase the secret, keeps the instance and announces no erasure', async () => {
    const keyring = fakeKeyring()
    await signIn(keyring)
    const lockedDuringTheRequest = async () => {
      keyring.lock()
      return Response.json({ action: 'revoked' })
    }
    const stopped = await runCommand('logout', { fetch: lockedDuringTheRequest, keyring: keyring.load, environment: { configHome: home } })
    expect(stopped).toMatchObject({ code: EXIT_CODES.usage, stdout: '', stderr: expect.stringContaining('cannot erase the token of “https://studio.example.test”, which stays on this machine') })
    await expect(createStorage({ configHome: home }).instanceAt(ORIGIN)).resolves.toMatchObject({ store: 'keyring' })
    keyring.unlock()
    expect(keyring.passwords.get(`vignettes/${ORIGIN}`)).toBe(SECRET)
  })

  it.each([undefined, 'locked'] as const)('erases the secret at its registered place at logout, keyring %s', async (failure) => {
    const keyring = fakeKeyring(failure)
    await signIn(keyring)
    const signedOut = await runCommand('logout', { keyring: keyring.load, fetch: async () => Response.json({ action: 'revoked' }), environment: { configHome: home } })
    expect(signedOut.code).toBe(EXIT_CODES.success)
    expect(keyring.passwords.size).toBe(0)
    const storage = createStorage({ configHome: home, loadKeyring: keyring.load })
    await expect(storage.readConfig()).resolves.toEqual({ instances: [] })
    expect(readdirSync(storage.folder)).toEqual(['config.json'])
  })

  it('sends whoami to logout on an instance whose secret is absent, and logout removes it with code 0, without calling the instance', async () => {
    const keyring = fakeKeyring()
    await signIn(keyring)
    keyring.passwords.clear()
    const fetch = vi.fn<typeof globalThis.fetch>()
    const shown = await runCommand('whoami', { fetch, keyring: keyring.load, environment: { configHome: home } })
    expect(shown).toMatchObject({ code: EXIT_CODES.usage, stderr: expect.stringContaining('its token vgt_test-sec is missing: run vignettes logout --instance https://studio.example.test, then vignettes login') })
    const signedOut = await runCommand('logout', { fetch, keyring: keyring.load, environment: { configHome: home } })
    expect(signedOut).toMatchObject({
      code: EXIT_CODES.success,
      stdout: expect.stringContaining('The token of https://studio.example.test is missing from this machine'),
      stderr: expect.stringContaining('If the token vgt_test-sec is still valid, revoke it'),
    })
    expect(fetch).not.toHaveBeenCalled()
    await expect(createStorage({ configHome: home }).readConfig()).resolves.toEqual({ instances: [] })
  })
})
