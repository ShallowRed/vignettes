import type { TargetInput } from '../../packages/cli/src/target.ts'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { instanceOrigin, openStorage, resolveInstance, resolveTarget } from '../../packages/cli/src/target.ts'
import { fakeKeyring } from './helpers/keyring'

// Secrets made up for the tests.
const STORED = 'vgt_made-up-secret-of-the-storage'
const FROM_ENVIRONMENT = 'vgt_made-up-secret-of-the-variable'

let home: string
let keyring: ReturnType<typeof fakeKeyring>
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'vignettes-target-'))
  keyring = fakeKeyring()
})
afterEach(() => rmSync(home, { recursive: true }))

function input(over: Partial<TargetInput> = {}, environment: Partial<TargetInput['environment']> = {}): TargetInput {
  return { keyring: keyring.load, ...over, environment: { configHome: home, ci: false, ...environment } }
}

async function registered(...instances: [name: string, origin: string][]) {
  const storage = await openStorage(input())
  for (const [name, origin] of instances)
    await storage.register({ name, origin, login: 'ann', prefix: 'vgt_abcdefgh', store: 'keyring' })
  return storage
}

describe('the origin of an instance (packages/cli/src/target.ts)', () => {
  it.each([
    ['https://app.vignettes.io/catalog?tab=decks', 'https://app.vignettes.io'],
    ['HTTPS://App.Vignettes.IO:443/', 'https://app.vignettes.io'],
    ['https://user:pass@app.vignettes.io', 'https://app.vignettes.io'],
    ['http://localhost:3000/', 'http://localhost:3000'],
    ['http://127.0.0.1:3000', 'http://127.0.0.1:3000'],
    ['http://[::1]:3000', 'http://[::1]:3000'],
  ])('reads %s as %s', (address, origin) => {
    expect(instanceOrigin(address)).toBe(origin)
  })

  it.each(['http://app.vignettes.io', 'http://localhost.example.test', 'http://10.0.0.1', 'ftp://app.vignettes.io', 'file:///tmp/deck'])('refuses %s, outside https and the machine itself', (address) => {
    expect(() => instanceOrigin(address)).toThrow(expect.objectContaining({ code: 'insecure-instance' }))
  })

  it('refuses a value that is not an address', () => {
    expect(() => instanceOrigin('https://')).toThrow(expect.objectContaining({ code: 'invalid-instance' }))
  })
})

describe('the instance a command contacts (packages/cli/src/target.ts)', () => {
  it('reads --instance, then VIGNETTES_INSTANCE, then the default instance', async () => {
    const storage = await registered(['studio', 'https://studio.example.test'], ['staging', 'https://staging.example.test'])
    const resolve = (instance?: string, variable?: string) => resolveInstance(input({ instance }, { instance: variable }), storage)
    await expect(resolve('https://option.example.test', 'https://variable.example.test')).resolves.toBe('https://option.example.test')
    await expect(resolve(undefined, 'https://variable.example.test/')).resolves.toBe('https://variable.example.test')
    await expect(resolve()).resolves.toBe('https://studio.example.test')
  })

  it('reads a value without :// as the name of a registered instance', async () => {
    const storage = await registered(['studio', 'https://studio.example.test'], ['staging', 'https://staging.example.test'])
    await expect(resolveInstance(input({ instance: 'staging' }), storage)).resolves.toBe('https://staging.example.test')
    await expect(resolveInstance(input({}, { instance: 'staging' }), storage)).resolves.toBe('https://staging.example.test')
    await expect(resolveInstance(input({ instance: 'other' }), storage)).rejects.toMatchObject({ code: 'unknown-instance', message: expect.stringContaining('“other”') })
  })

  it('stops with code 2 and names --instance without an instance', async () => {
    const storage = await openStorage(input())
    await expect(resolveInstance(input(), storage)).rejects.toMatchObject({ code: 'missing-instance', message: expect.stringContaining('--instance') })
  })
})

describe('the secret a command sends (packages/cli/src/target.ts)', () => {
  it('sends VIGNETTES_TOKEN when it is set, else the secret stored for the origin', async () => {
    const storage = await registered(['studio', 'https://studio.example.test'])
    await storage.saveSecret('https://studio.example.test', STORED)
    await expect(resolveTarget(input())).resolves.toMatchObject({ origin: 'https://studio.example.test', token: STORED })
    await expect(resolveTarget(input({}, { token: FROM_ENVIRONMENT }))).resolves.toMatchObject({ origin: 'https://studio.example.test', token: FROM_ENVIRONMENT })
    await expect(resolveTarget(input({ instance: 'https://other.example.test' }))).resolves.toMatchObject({ origin: 'https://other.example.test', token: undefined })
  })

  it('stops with code 2 when the keyring that holds the secret cannot be read, and reads no file', async () => {
    const storage = await registered(['studio', 'https://studio.example.test'])
    await storage.saveSecret('https://studio.example.test', STORED)
    keyring.lock()
    await expect(resolveTarget(input())).rejects.toMatchObject({ code: 'keyring-unreadable', message: expect.stringContaining('unlock it') })
    await expect(resolveTarget(input({}, { token: FROM_ENVIRONMENT }))).resolves.toMatchObject({ token: FROM_ENVIRONMENT })
  })
})
