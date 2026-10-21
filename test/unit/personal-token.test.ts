import { existsSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { assertOwner } from '../../layers/studio/server/utils/access'
import { actorLabel, getActor } from '../../layers/studio/server/utils/actor'
import { hashToken, mintToken, TOKEN_ROUTES, useTokenStore } from '../../layers/studio/server/utils/personal-token'
import { resetRateLimits } from '../../layers/studio/server/utils/rate-limit'
import { useDeckMeta, usePermissionStore } from '../../layers/studio/server/utils/sources'
import { useUserStore } from '../../layers/studio/server/utils/users'
import { scopeAllows, tokenRole, tokenState } from '../../layers/studio/shared/access/tokens'
import { anon, asUser, bearer, seedAccount, setupServerDb, stubH3Globals, testRows } from './helpers/server-db'

stubH3Globals()
setupServerDb()

const { default: listTokens } = await import('../../layers/studio/server/api/tokens/index.get')
const { default: createToken } = await import('../../layers/studio/server/api/tokens/index.post')
const { default: deleteToken } = await import('../../layers/studio/server/api/tokens/[id].delete')
const { default: currentToken } = await import('../../layers/studio/server/api/tokens/current.get')
const { default: logout } = await import('../../layers/studio/server/api/tokens/current.delete')
const { default: revokeAccountTokens } = await import('../../layers/studio/server/api/admin/users/[id]/tokens.delete')
const { default: listUsers } = await import('../../layers/studio/server/api/admin/users.get')
const { default: loadDeck } = await import('../../layers/studio/server/api/presentations/[slug].get')
const { default: saveDraft } = await import('../../layers/studio/server/api/presentations/[slug].put')
const { default: publish } = await import('../../layers/studio/server/api/presentations/[slug]/publish.post')
const { default: markdown } = await import('../../layers/studio/server/api/presentations/[slug]/markdown.get')
const { default: history } = await import('../../layers/studio/server/api/presentations/[slug]/history.get')
const { default: contentDecks } = await import('../../layers/studio/server/api/content/decks.get')
const { default: sameOrigin } = await import('../../layers/studio/server/middleware/same-origin')
const { default: sessionActivity } = await import('../../layers/studio/server/middleware/session-activity')

const OWNER = { id: 1, login: 'ann' }
const EDITOR = { id: 2, login: 'eve' }
const VIEWER = { id: 3, login: 'vic' }
const raw = '---\ntitle: Deck\n---\n\n# Hello\n'

/** A request of this account's session. */
function session(user: { id: number, login: string }, method: string, path: string, over: Record<string, unknown> = {}) {
  return asUser(user.id, user.login, { method, path, ...over })
}

async function tokenOf(user: { id: number, login: string }, body: Record<string, unknown> = {}): Promise<string> {
  const created = await createToken(session(user, 'POST', '/api/tokens', { body: { name: 'CLI', scope: 'write', ...body } }))
  return created.secret
}

const logs: string[] = []

beforeEach(async () => {
  resetRateLimits()
  logs.length = 0
  for (const level of ['info', 'warn', 'error'] as const)
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void logs.push(args.join(' ')))
  await seedAccount(OWNER.id, OWNER.login, 'owner')
  await seedAccount(EDITOR.id, EDITOR.login, 'editor')
  await seedAccount(VIEWER.id, VIEWER.login, 'viewer')
  await useDeckMeta().update('deck', { title: 'Deck' })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('token rules', () => {
  it('caps the role at editor', () => {
    expect([tokenRole('owner'), tokenRole('editor'), tokenRole('viewer')]).toEqual(['editor', 'editor', 'viewer'])
  })

  it('lets write include read, never the reverse', () => {
    expect([scopeAllows('write', 'read'), scopeAllows('write', 'write'), scopeAllows('read', 'read'), scopeAllows('read', 'write')]).toEqual([true, true, true, false])
  })

  it('tells an active, an expired and a revoked token apart', () => {
    const now = new Date(1_000_000)
    expect(tokenState({ revokedAt: null, expiresAt: new Date(1_000_001) }, now)).toBe('active')
    expect(tokenState({ revokedAt: null, expiresAt: now }, now)).toBe('expired')
    expect(tokenState({ revokedAt: now, expiresAt: new Date(2_000_000) }, now)).toBe('revoked')
  })

  it('mints a secret of 32 random bytes after vgt_, shown by its first characters', () => {
    const { secret, tokenHash, prefix } = mintToken()
    expect(secret).toMatch(/^vgt_[\w-]{43}$/)
    expect(prefix).toBe(secret.slice(0, 12))
    expect(tokenHash).toBe(hashToken(secret))
    expect(mintToken().secret).not.toBe(secret)
  })

  it('lists routes that exist in server/api', () => {
    const api = join(process.cwd(), 'layers/studio/server')
    for (const route of TOKEN_ROUTES) {
      const base = join(api, route.path.replace(/:(\w+)/g, '[$1]'))
      const method = route.method.toLowerCase()
      expect([`${base}.${method}.ts`, join(base, `index.${method}.ts`)].some(existsSync), `${route.method} ${route.path}`).toBe(true)
    }
  })
})

describe('creating a token', () => {
  it('returns the secret once and stores its hash only', async () => {
    const created = await createToken(session(VIEWER, 'POST', '/api/tokens', { body: { name: 'CLI MacBook', scope: 'read' } }))
    expect(created.secret).toMatch(/^vgt_/)
    expect(created.token).toMatchObject({ name: 'CLI MacBook', scope: 'read', state: 'active', prefix: created.secret.slice(0, 12) })
    const [row] = await testRows().select('personalTokens', { userId: VIEWER.id })
    expect(row!.tokenHash).toBe(hashToken(created.secret))
    expect(Object.values(row!).some(value => String(value).includes(created.secret.slice(12)))).toBe(false)
    expect(await listTokens(session(VIEWER, 'GET', '/api/tokens'))).not.toContain(created.secret)
  })

  it('lasts 90 days by default, 365 at most, and is never permanent', async () => {
    const created = await createToken(session(VIEWER, 'POST', '/api/tokens', { body: { name: 'CLI', scope: 'read' } }))
    const days = (Date.parse(created.token.expiresAt) - Date.parse(created.token.createdAt)) / 86_400_000
    expect(Math.round(days)).toBe(90)
    for (const days of [366, 0, null, 1.5])
      await expect(createToken(session(VIEWER, 'POST', '/api/tokens', { body: { name: 'CLI', scope: 'read', days } }))).rejects.toMatchObject({ statusCode: 400 })
  })

  it('requires a session (401) and refuses a token (403), so a token creates and lists no token', async () => {
    await expect(createToken(anon({ method: 'POST', path: '/api/tokens', body: { name: 'CLI', scope: 'read' } }))).rejects.toMatchObject({ statusCode: 401 })
    const secret = await tokenOf(EDITOR)
    await expect(createToken(bearer(secret, { method: 'POST', path: '/api/tokens', body: { name: 'more', scope: 'write' } }))).rejects.toMatchObject({ statusCode: 403 })
    await expect(listTokens(bearer(secret, { method: 'GET', path: '/api/tokens' }))).rejects.toMatchObject({ statusCode: 403 })
    await expect(deleteToken(bearer(secret, { method: 'DELETE', path: '/api/tokens/1', params: { id: '1' } }))).rejects.toMatchObject({ statusCode: 403 })
  })

  it('stops at 10 creations per account and hour (429)', async () => {
    for (let i = 0; i < 10; i++)
      await tokenOf(VIEWER)
    await expect(tokenOf(VIEWER)).rejects.toMatchObject({ statusCode: 429 })
    await expect(tokenOf(EDITOR)).resolves.toMatch(/^vgt_/)
  })

  it('logs the creation in the security log by prefix, never the secret', async () => {
    const secret = await tokenOf(EDITOR, { name: 'CLI MacBook' })
    expect(logs).toEqual([expect.stringMatching(new RegExp(`^\\[security\\] token-creation token=${secret.slice(0, 12)} name="CLI MacBook" scope=write until=\\d{4}-\\d{2}-\\d{2} by eve from 127\\.0\\.0\\.1$`))])
    expect(logs.join('\n')).not.toContain(secret)
  })
})

describe('the tokens of one account', () => {
  it('lists and revokes the own tokens only', async () => {
    await tokenOf(EDITOR)
    const [own] = await listTokens(session(EDITOR, 'GET', '/api/tokens'))
    expect(await listTokens(session(VIEWER, 'GET', '/api/tokens'))).toEqual([])
    await expect(deleteToken(session(VIEWER, 'DELETE', `/api/tokens/${own!.id}`, { params: { id: String(own!.id) } }))).rejects.toMatchObject({ statusCode: 404 })
    await expect(deleteToken(session(EDITOR, 'DELETE', `/api/tokens/${own!.id}`, { params: { id: String(own!.id) } }))).resolves.toEqual({ action: 'revoked' })
    expect(logs).toContain(`[security] token-revocation token=${own!.prefix} by eve from 127.0.0.1`)
    expect(await listTokens(session(EDITOR, 'GET', '/api/tokens'))).toMatchObject([{ id: own!.id, state: 'revoked' }])
    await expect(deleteToken(session(EDITOR, 'DELETE', `/api/tokens/${own!.id}`, { params: { id: String(own!.id) } }))).resolves.toEqual({ action: 'removed' })
    expect(await listTokens(session(EDITOR, 'GET', '/api/tokens'))).toEqual([])
  })

  it('refuses the session of a removed account (401)', async () => {
    await useUserStore().remove(VIEWER.id)
    await expect(tokenOf(VIEWER)).rejects.toMatchObject({ statusCode: 401 })
    expect(await testRows().select('personalTokens')).toEqual([])
  })

  it('lets the owner revoke every token of an account, and no one else', async () => {
    const secret = await tokenOf(VIEWER)
    const target = { params: { id: String(VIEWER.id) } }
    await expect(revokeAccountTokens(session(EDITOR, 'DELETE', '/api/admin/users/3/tokens', target))).rejects.toMatchObject({ statusCode: 403 })
    await expect(revokeAccountTokens(session(OWNER, 'DELETE', '/api/admin/users/3/tokens', target))).resolves.toEqual({ revoked: 1 })
    await expect(revokeAccountTokens(session(OWNER, 'DELETE', '/api/admin/users/x/tokens', { params: { id: 'x' } }))).rejects.toMatchObject({ statusCode: 400 })
    await expect(revokeAccountTokens(session(OWNER, 'DELETE', '/api/admin/users/404/tokens', { params: { id: '404' } }))).rejects.toMatchObject({ statusCode: 404 })
    await expect(getActor(bearer(secret, { method: 'GET', path: '/api/projects' }))).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('a request with a token', () => {
  it('acts as its account, capped at editor', async () => {
    const owner = await tokenOf(OWNER)
    await expect(getActor(bearer(owner, { method: 'GET', path: '/api/projects' }))).resolves.toMatchObject({ id: OWNER.id, login: 'ann', role: 'editor' })
    await expect(assertOwner(bearer(owner, { method: 'GET', path: '/api/projects' }))).rejects.toMatchObject({ statusCode: 403 })
  })

  it('describes itself on /api/tokens/current, and revokes itself there', async () => {
    const secret = await tokenOf(VIEWER, { scope: 'read', name: 'CI' })
    await expect(currentToken(bearer(secret, { method: 'GET', path: '/api/tokens/current' }))).resolves.toMatchObject({ login: 'vic', role: 'viewer', name: 'CI', scope: 'read', prefix: secret.slice(0, 12) })
    await expect(logout(bearer(secret, { method: 'DELETE', path: '/api/tokens/current' }))).resolves.toEqual({ action: 'revoked' })
    await expect(currentToken(bearer(secret, { method: 'GET', path: '/api/tokens/current' }))).rejects.toMatchObject({ statusCode: 401 })
  })

  it('saves and publishes a deck its account may edit, signed with the account', async () => {
    const secret = await tokenOf(EDITOR)
    await expect(saveDraft(bearer(secret, { method: 'PUT', path: '/api/presentations/deck', params: { slug: 'deck' }, body: { raw } }))).resolves.toMatchObject({ ok: true })
    await expect(publish(bearer(secret, { method: 'POST', path: '/api/presentations/deck/publish', params: { slug: 'deck' } }))).resolves.toMatchObject({ ok: true })
    const [version] = await testRows().select('deckVersions', { deckSlug: 'deck' })
    expect(version).toMatchObject({ raw, publishedBy: 'eve' })
  })

  it('cannot write with the token of a viewer', async () => {
    const secret = await tokenOf(VIEWER)
    await expect(saveDraft(bearer(secret, { method: 'PUT', path: '/api/presentations/deck', params: { slug: 'deck' }, body: { raw } }))).rejects.toMatchObject({ statusCode: 404 })
    await useDeckMeta().update('deck', { status: 'public' })
    await expect(saveDraft(bearer(secret, { method: 'PUT', path: '/api/presentations/deck', params: { slug: 'deck' }, body: { raw } }))).rejects.toMatchObject({ statusCode: 403 })
  })

  it('writes with the grants of its account, and loses them with the account', async () => {
    const secret = await tokenOf(VIEWER)
    await usePermissionStore().set('deck', VIEWER.id, 'editor', 'ann')
    const save = () => saveDraft(bearer(secret, { method: 'PUT', path: '/api/presentations/deck', params: { slug: 'deck' }, body: { raw } }))
    await expect(save()).resolves.toMatchObject({ ok: true })
    await usePermissionStore().remove('deck', VIEWER.id)
    await expect(save()).rejects.toMatchObject({ statusCode: 404 })
  })

  it('follows a lowered role from the next request', async () => {
    const secret = await tokenOf(EDITOR)
    const read = () => loadDeck(bearer(secret, { method: 'GET', path: '/api/presentations/deck', params: { slug: 'deck' }, query: { draft: '' } }))
    await saveDraft(bearer(secret, { method: 'PUT', path: '/api/presentations/deck', params: { slug: 'deck' }, body: { raw } }))
    await expect(read()).resolves.toMatchObject({ content: raw })
    await useUserStore().setRole(EDITOR.id, 'viewer')
    await expect(read()).rejects.toMatchObject({ statusCode: 404 })
  })

  it('reads no deck its account cannot read (404)', async () => {
    const secret = await tokenOf(VIEWER, { scope: 'read' })
    await expect(loadDeck(bearer(secret, { method: 'GET', path: '/api/presentations/deck', params: { slug: 'deck' }, query: { draft: '' } }))).rejects.toMatchObject({ statusCode: 404 })
    await expect(markdown(bearer(secret, { method: 'GET', path: '/api/presentations/deck/markdown', params: { slug: 'deck' }, query: { draft: '' } }))).rejects.toMatchObject({ statusCode: 404 })
    await expect(contentDecks(bearer(secret, { method: 'GET', path: '/api/content/decks', query: { slugs: 'deck' } }))).rejects.toMatchObject({ statusCode: 403 })
  })

  it('reaches the content routes when its account has the editor role', async () => {
    const secret = await tokenOf(EDITOR, { scope: 'read' })
    await expect(contentDecks(bearer(secret, { method: 'GET', path: '/api/content/decks', query: { slugs: 'deck' } }))).resolves.toEqual([expect.objectContaining({ slug: 'deck' })])
  })

  it('cannot write with the read scope (403)', async () => {
    const secret = await tokenOf(EDITOR, { scope: 'read' })
    await expect(saveDraft(bearer(secret, { method: 'PUT', path: '/api/presentations/deck', params: { slug: 'deck' }, body: { raw } }))).rejects.toMatchObject({ statusCode: 403, statusMessage: expect.stringContaining('read scope') })
  })

  it('reaches no route outside TOKEN_ROUTES (403)', async () => {
    const secret = await tokenOf(OWNER)
    await expect(listUsers(bearer(secret, { method: 'GET', path: '/api/admin/users' }))).rejects.toMatchObject({ statusCode: 403, statusMessage: 'This route does not accept a personal token' })
    await expect(history(bearer(secret, { method: 'GET', path: '/api/presentations/deck/history', params: { slug: 'deck' } }))).rejects.toMatchObject({ statusCode: 403 })
    await expect(getActor(bearer(secret, { method: 'GET', path: '/api/presentations/deck/../../admin/users' }))).rejects.toMatchObject({ statusCode: 403 })
    await expect(getActor(bearer(secret, { method: 'POST', path: '/api/projects' }))).rejects.toMatchObject({ statusCode: 403 })
  })

  it('follows the route the router matched over the path', async () => {
    const secret = await tokenOf(EDITOR)
    const routed = bearer(secret, { method: 'GET', path: '/api/projects', context: { matchedRoute: { path: '/api/admin/users' } } })
    await expect(getActor(routed)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('checks the route the router matched after the middlewares ran on the path', async () => {
    const secret = await tokenOf(EDITOR)
    const request = bearer(secret, { method: 'GET', path: '/api/projects', context: {} })
    await sessionActivity(request)
    request.context.matchedRoute = { path: '/api/admin/users' }
    await expect(getActor(request)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('is refused once revoked or expired (401), and logged by prefix', async () => {
    const revoked = await tokenOf(EDITOR)
    const [own] = await listTokens(session(EDITOR, 'GET', '/api/tokens'))
    await deleteToken(session(EDITOR, 'DELETE', `/api/tokens/${own!.id}`, { params: { id: String(own!.id) } }))
    await expect(getActor(bearer(revoked, { method: 'GET', path: '/api/projects' }))).rejects.toMatchObject({ statusCode: 401, statusMessage: 'Personal token revoked' })

    const expired = await tokenOf(EDITOR)
    await testRows().update('personalTokens', { expiresAt: new Date(Date.now() - 1000) }, { tokenHash: hashToken(expired) })
    await expect(getActor(bearer(expired, { method: 'GET', path: '/api/projects' }))).rejects.toMatchObject({ statusCode: 401, statusMessage: 'Personal token expired' })
    expect(logs).toContain(`[token] refused ${expired.slice(0, 12)} (expired)`)
    expect(logs.join('\n')).not.toContain(expired)
  })

  it('refuses an unknown token (401), then a client past 20 failures (429) before reading the database', async () => {
    const unknown = mintToken().secret
    for (let i = 0; i < 20; i++)
      await expect(getActor(bearer(unknown, { method: 'GET', path: '/api/projects' }))).rejects.toMatchObject({ statusCode: 401 })
    const lookup = vi.spyOn(useTokenStore(), 'findByHash')
    await expect(getActor(bearer(unknown, { method: 'GET', path: '/api/projects' }))).rejects.toMatchObject({ statusCode: 429 })
    expect(lookup).not.toHaveBeenCalled()
    const forged = { 'authorization': `Bearer ${unknown}`, 'x-forwarded-for': '10.9.9.9' }
    await expect(getActor(bearer(unknown, { method: 'GET', path: '/api/projects', headers: forged }))).rejects.toMatchObject({ statusCode: 429 })
    await expect(getActor(bearer(unknown, { method: 'GET', path: '/api/projects', ip: '10.0.0.2' }))).rejects.toMatchObject({ statusCode: 401 })
  })

  it('stops at 300 requests per token in 5 minutes (429)', async () => {
    const secret = await tokenOf(EDITOR)
    for (let i = 0; i < 300; i++)
      await getActor(bearer(secret, { method: 'GET', path: '/api/projects' }))
    await expect(getActor(bearer(secret, { method: 'GET', path: '/api/projects' }))).rejects.toMatchObject({ statusCode: 429 })
  })

  it('names its prefix after the login in the log lines', async () => {
    const secret = await tokenOf(EDITOR)
    expect(actorLabel(await getActor(bearer(secret, { method: 'GET', path: '/api/projects' })))).toBe(`eve via ${secret.slice(0, 12)}`)
    expect(actorLabel(await getActor(session(EDITOR, 'GET', '/api/projects')))).toBe('eve')
  })

  it('resolves once per request, and records its last use', async () => {
    const secret = await tokenOf(EDITOR)
    const request = bearer(secret, { method: 'GET', path: '/api/projects' })
    const lookup = vi.spyOn(useTokenStore(), 'findByHash')
    await getActor(request)
    await getActor(request)
    expect(lookup).toHaveBeenCalledTimes(1)
    const [row] = await testRows().select('personalTokens', { tokenHash: hashToken(secret) })
    expect(row!.lastUsedAt).toBeInstanceOf(Date)
  })

  it('refuses an unreadable token (401), even over a session', async () => {
    const secret = await tokenOf(OWNER)
    for (const value of ['vgt_short', `${secret} extra`]) {
      const request = session(OWNER, 'GET', '/api/admin/users', { headers: { authorization: `Bearer ${value}` } })
      await expect(getActor(request)).rejects.toMatchObject({ statusCode: 401, statusMessage: 'Unreadable personal token' })
    }
  })

  it('passes the same-origin guard when valid, as a request of the command line', async () => {
    vi.stubGlobal('getRequestURL', () => new URL('https://studio.example/'))
    const secret = await tokenOf(EDITOR)
    const write = (token: string) => sameOrigin(bearer(token, { method: 'PUT', path: '/api/presentations/deck' }))
    await expect(write(secret)).resolves.toBeUndefined()
    await expect(write(mintToken().secret)).rejects.toMatchObject({ statusCode: 401 })
  })

  it('leaves the session of a request without a personal token as it is', async () => {
    await expect(getActor(session(EDITOR, 'GET', '/api/admin/users', { headers: { authorization: 'Bearer other' } }))).resolves.toMatchObject({ login: 'eve', role: 'editor' })
  })
})
