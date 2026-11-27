import type { KeyringFailure } from './helpers/keyring'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TOKEN_ROUTES } from '../../layers/studio/server/utils/personal-token'
import { resetRateLimits } from '../../layers/studio/server/utils/rate-limit'
import manifest from '../../packages/cli/package.json' with { type: 'json' }
import { CURRENT_TOKEN, REVOKE_TOKEN, ROUTES } from '../../packages/cli/src/api.ts'
import { EXIT_CODES } from '../../packages/cli/src/output.ts'
import { runCommand } from './helpers/cli-run'
import { fakeKeyring } from './helpers/keyring'
import { anon, asUser, seedAccount, setupServerDb, stubH3Globals } from './helpers/server-db'

// The client of the command line against the two handlers of
// /api/tokens/current, reached through a fetch that builds the fake events of
// the server tests.
stubH3Globals()
setupServerDb()

const prompts = vi.hoisted(() => ({ cancel: Symbol('cancel'), password: vi.fn() }))
vi.mock('@clack/prompts', () => ({ password: prompts.password, isCancel: (value: unknown) => value === prompts.cancel }))

const { default: currentToken } = await import('../../layers/studio/server/api/tokens/current.get')
const { default: revokeToken } = await import('../../layers/studio/server/api/tokens/current.delete')
const { default: createToken } = await import('../../layers/studio/server/api/tokens/index.post')

const ORIGIN = 'https://studio.example.test'
const HANDLERS: Record<string, (event: unknown) => Promise<unknown>> = {
  'GET /api/tokens/current': currentToken,
  'DELETE /api/tokens/current': revokeToken,
}

interface Call { method: string, url: string, redirect: RequestRedirect | undefined, authorization: string | null, userAgent: string | null }

let calls: Call[]
let home: string
beforeEach(async () => {
  resetRateLimits()
  calls = []
  home = mkdtempSync(join(tmpdir(), 'vignettes-routes-'))
  await seedAccount(1, 'ann', 'editor')
})
afterEach(() => rmSync(home, { recursive: true }))

function record(input: string | URL | Request, init: RequestInit = {}): { url: URL, method: string, headers: Headers } {
  const url = new URL(String(input))
  const headers = new Headers(init.headers)
  const method = init.method ?? 'GET'
  calls.push({ method, url: url.href, redirect: init.redirect, authorization: headers.get('authorization'), userAgent: headers.get('user-agent') })
  return { url, method, headers }
}

/** The studio: each request reaches the handler of its route, as a fake event. */
const studio: typeof fetch = async (input, init) => {
  const { url, method, headers } = record(input, init)
  const handler = HANDLERS[`${method} ${url.pathname}`]
  if (!handler)
    return new Response(null, { status: 404 })
  try {
    return Response.json(await handler(anon({ method, path: url.pathname, headers: Object.fromEntries(headers) })))
  }
  catch (error) {
    const { statusCode = 500, statusMessage = '' } = error as { statusCode?: number, statusMessage?: string }
    return Response.json({ statusCode, statusMessage }, { status: statusCode })
  }
}

/** A secret the studio creates for the test account. */
async function createdSecret(): Promise<string> {
  const created = await createToken(asUser(1, 'ann', { method: 'POST', path: '/api/tokens', body: { name: 'CLI', scope: 'read', days: 30 } })) as { secret: string }
  return created.secret
}

const environment = (over: Record<string, string> = {}) => ({ configHome: home, ...over })

/** Every output of a run, the JSON document included, without the secret. */
function expectNoSecret(run: { stdout: string, stderr: string }, secret: string) {
  expect(run.stdout).not.toContain(secret)
  expect(run.stderr).not.toContain(secret)
}

describe('the routes of the command line (packages/cli/src/api.ts)', () => {
  it('calls the routes of TOKEN_ROUTES only', () => {
    for (const route of ROUTES)
      expect(TOKEN_ROUTES).toContainEqual(expect.objectContaining({ method: route.method, path: route.path }))
  })

  it('reads the answers of the two handlers of /api/tokens/current', async () => {
    const secret = await createdSecret()
    const event = (method: string) => anon({ method, path: '/api/tokens/current', headers: { authorization: `Bearer ${secret}` } })
    const answer = await currentToken(event('GET'))
    expect(CURRENT_TOKEN.answer.parse(answer)).toEqual(answer)
    expect(CURRENT_TOKEN.answer.parse({ ...answer, more: 1 })).toEqual(answer)
    expect(REVOKE_TOKEN.answer.parse(await revokeToken(event('DELETE')))).toEqual({ action: 'revoked' })
  })
})

describe('login, whoami and logout against the studio (packages/cli/src/commands)', () => {
  it.each([undefined, 'locked'] as (KeyringFailure | undefined)[])('signs in, shows the token and signs out, with the keyring %s, and never writes the secret', async (failure) => {
    const secret = await createdSecret()
    const keyring = fakeKeyring(failure)
    const common = { fetch: studio, keyring: keyring.load, environment: environment() }
    const runs = []

    const signedIn = await runCommand('login', { ...common, options: { 'instance': `${ORIGIN}/catalog`, 'token-stdin': true }, stdin: Readable.from([`${secret}\n`]) })
    runs.push(signedIn)
    expect(signedIn).toMatchObject({ code: EXIT_CODES.success })
    expect(signedIn.stdout).toContain('Signed in to https://studio.example.test as “studio.example.test”.')
    expect(signedIn.stdout).toMatch(/Account {3}ann\nRole {6}editor\nScope {5}read\nToken {5}vgt_\S{8} \(CLI\)\nExpires {3}\d{4}-/)
    expect(signedIn.stderr).toEqual(failure ? expect.stringContaining('credentials.json, which your account alone can read') : '')
    expect(readdirSync(join(home, 'vignettes')).sort()).toEqual(failure ? ['config.json', 'credentials.json'] : ['config.json'])
    expect(readFileSync(join(home, 'vignettes', 'config.json'), 'utf8')).not.toContain(secret)

    const shown = await runCommand('whoami', { ...common, options: { json: true } })
    runs.push(shown)
    expect(JSON.parse(shown.stdout)).toEqual({
      ok: true,
      cli: manifest.version,
      command: 'whoami',
      instance: ORIGIN,
      results: [{ instance: ORIGIN, login: 'ann', role: 'editor', token: { name: 'CLI', prefix: secret.slice(0, 12), scope: 'read', expiresAt: expect.any(String) } }],
    })

    const again = await runCommand('login', { ...common, options: { 'token-stdin': true }, stdin: Readable.from([secret]) })
    runs.push(again)
    expect(again).toMatchObject({ code: EXIT_CODES.usage, stderr: expect.stringContaining('run vignettes logout --instance https://studio.example.test first') })

    const signedOut = await runCommand('logout', common)
    runs.push(signedOut)
    expect(signedOut).toMatchObject({ code: EXIT_CODES.success, stdout: 'Signed out of https://studio.example.test: the token is revoked, and erased from this machine.\n' })
    expect(readdirSync(join(home, 'vignettes'))).toEqual(['config.json'])
    expect(keyring.passwords.size).toBe(0)
    await expect(currentToken(anon({ method: 'GET', path: '/api/tokens/current', headers: { authorization: `Bearer ${secret}` } }))).rejects.toMatchObject({ statusCode: 401 })

    const after = await runCommand('whoami', { ...common, options: { instance: ORIGIN } })
    runs.push(after)
    expect(after).toMatchObject({ code: EXIT_CODES.usage, stderr: expect.stringContaining('No token of “https://studio.example.test”') })

    for (const run of runs)
      expectNoSecret(run, secret)
    expect(new Set(calls.map(call => `${call.method} ${call.url}`))).toEqual(new Set(['GET https://studio.example.test/api/tokens/current', 'DELETE https://studio.example.test/api/tokens/current']))
    for (const call of calls)
      expect(call).toMatchObject({ redirect: 'manual', authorization: `Bearer ${secret}`, userAgent: `vignettes-cli/${manifest.version}` })
  })

  it('asks for the token on the standard error in a terminal, and stops with code 130 when the question is cancelled', async () => {
    const secret = await createdSecret()
    const common = { fetch: studio, keyring: fakeKeyring().load, environment: environment(), interactive: true, options: { instance: ORIGIN } }
    prompts.password.mockResolvedValueOnce(prompts.cancel)
    const cancelled = await runCommand('login', common)
    expect(cancelled).toMatchObject({ code: EXIT_CODES.interrupted, stdout: '', stderr: 'vignettes: Stopped by Ctrl+C.\n' })
    expect(readdirSync(home)).toEqual([])
    expect(calls).toEqual([])

    prompts.password.mockResolvedValueOnce(`${secret}\n`)
    const signedIn = await runCommand('login', common)
    expect(signedIn).toMatchObject({ code: EXIT_CODES.success, stdout: expect.stringContaining('Signed in to https://studio.example.test') })
    expectNoSecret(signedIn, secret)
    expect(prompts.password).toHaveBeenLastCalledWith({ message: 'Token of https://studio.example.test', output: process.stderr })
  })

  it('signs out with code 0 when the instance refuses a token revoked already', async () => {
    const secret = await createdSecret()
    const common = { fetch: studio, keyring: fakeKeyring().load, environment: environment() }
    await runCommand('login', { ...common, options: { 'instance': ORIGIN, 'token-stdin': true }, stdin: Readable.from([secret]) })
    await revokeToken(anon({ method: 'DELETE', path: '/api/tokens/current', headers: { authorization: `Bearer ${secret}` } }))
    const signedOut = await runCommand('logout', common)
    expect(signedOut).toMatchObject({ code: EXIT_CODES.success, stdout: expect.stringContaining('the instance had revoked the token or the token had expired') })
    expect(await runCommand('logout', { ...common, options: { instance: ORIGIN } })).toMatchObject({ code: EXIT_CODES.usage })
  })
})

// A secret made up for the tests, which each answer below repeats.
const WITNESS = 'vgt_witness-secret-of-the-route-tests'

/** An instance that answers every request with `answer`. */
function answering(answer: () => Response): typeof fetch {
  return async (input, init) => {
    record(input, init)
    return answer()
  }
}

const echo = { statusMessage: `Personal token ${WITNESS} refused` }

const REDIRECT = () => new Response(null, { status: 302, headers: { location: `https://elsewhere.example.test/login?token=${WITNESS}` } })

const STATUSES: [string, () => Response, number][] = [
  ['302', REDIRECT, EXIT_CODES.instance],
  ['301 to a path', () => new Response(null, { status: 301, headers: { location: '/api/tokens/current/' } }), EXIT_CODES.instance],
  ['401', () => Response.json(echo, { status: 401 }), EXIT_CODES.authentication],
  ['403', () => Response.json(echo, { status: 403 }), EXIT_CODES.permission],
  ['404', () => Response.json(echo, { status: 404 }), EXIT_CODES.instance],
  ...[400, 411, 413, 415, 429, 500, 502, 503].map(status => [String(status), () => Response.json(echo, { status }), EXIT_CODES.instance] as [string, () => Response, number]),
  ['an answer outside its schema', () => Response.json({ ...echo, login: 1 }), EXIT_CODES.instance],
  ['a valid answer that repeats the token', () => Response.json({ login: 'ann', role: 'editor', name: WITNESS, prefix: WITNESS, scope: 'read', expiresAt: '2027-01-01T00:00:00.000Z' }), EXIT_CODES.instance],
  ['an answer that is not JSON', () => new Response(`<html>${WITNESS}</html>`), EXIT_CODES.instance],
]

describe('the answers of an instance (packages/cli/src/remote.ts)', () => {
  it.each(STATUSES)('gives %s its exit code, and writes no secret', async (_, answer, code) => {
    const fetch = answering(answer)
    for (const json of [false, true]) {
      const shown = await runCommand('whoami', { fetch, keyring: fakeKeyring().load, options: { instance: ORIGIN, json }, environment: environment({ token: WITNESS }) })
      expect(shown.code).toBe(code)
      expectNoSecret(shown, WITNESS)
      if (json)
        expect(JSON.parse(shown.stdout)).toMatchObject({ ok: false, command: 'whoami', instance: ORIGIN, error: { code: expect.any(String) } })

      const signedIn = await runCommand('login', { fetch, keyring: fakeKeyring().load, options: { 'instance': ORIGIN, 'token-stdin': true, json }, stdin: Readable.from([WITNESS]), environment: environment() })
      expect(signedIn.code).toBe(code)
      expectNoSecret(signedIn, WITNESS)
    }
    expect(readdirSync(home)).toEqual([])
    expect(calls).toHaveLength(4)
    expect(calls.every(call => call.url === `${ORIGIN}/api/tokens/current` && call.redirect === 'manual')).toBe(true)
  })

  it('names the address of a redirection without the secret', async () => {
    const shown = await runCommand('whoami', { fetch: answering(REDIRECT), options: { instance: ORIGIN }, environment: environment({ token: WITNESS }) })
    expect(shown.stderr).toBe('vignettes: The instance “https://studio.example.test” redirects to “https://elsewhere.example.test/login?token=<token>”: the command line sends the token to the origin it was given only, so give the origin of the instance itself.\n')
  })

  it('gives a network error code 6', async () => {
    const unreachable: typeof fetch = async () => {
      throw new TypeError('fetch failed', { cause: Object.assign(new Error(`connect ECONNREFUSED ${WITNESS}`), { code: 'ECONNREFUSED' }) })
    }
    const shown = await runCommand('whoami', { fetch: unreachable, options: { instance: ORIGIN }, environment: environment({ token: WITNESS }) })
    expect(shown).toMatchObject({ code: EXIT_CODES.instance, stderr: 'vignettes: The instance “https://studio.example.test” cannot be reached (ECONNREFUSED).\n' })
  })

  it('keeps the secret when logout fails on the instance, and says so', async () => {
    const keyring = fakeKeyring()
    const secret = 'vgt_made-up-secret-kept-after-a-failure'
    await runCommand('login', { fetch: answering(() => Response.json({ login: 'ann', role: 'editor', name: 'CLI', prefix: secret.slice(0, 12), scope: 'read', expiresAt: '2027-01-01T00:00:00.000Z' })), keyring: keyring.load, options: { 'instance': ORIGIN, 'token-stdin': true }, stdin: Readable.from([secret]), environment: environment() })
    const failed = await runCommand('logout', { fetch: answering(() => new Response(secret, { status: 503 })), keyring: keyring.load, environment: environment() })
    expect(failed).toMatchObject({ code: EXIT_CODES.instance, stderr: expect.stringContaining('The token stays on this machine: run vignettes logout again, or vignettes logout --instance https://studio.example.test --local') })
    expectNoSecret(failed, secret)
    expect(keyring.passwords.get(`vignettes/${ORIGIN}`)).toBe(secret)
  })
})
