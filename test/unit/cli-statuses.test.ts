import type { DeckOutcome, DeckRoute, FailedAnswer, RemoteDraft } from '../../packages/cli/src/push-plan.ts'
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creationDraft } from '@vignettes/core/deck'
import { textDigest } from '@vignettes/core/digest'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readLocalDeck } from '../../packages/cli/src/local-deck.ts'
import { EXIT_CODES } from '../../packages/cli/src/output.ts'
import { ACTION_EXIT_CODES, deckOutcome, digestOutcome, outcomeExit, TOO_MANY_INVALID_TOKENS, TOO_MANY_TOKEN_REQUESTS } from '../../packages/cli/src/push-plan.ts'
import { runCommand } from './helpers/cli-run'

const ROUTES: DeckRoute[] = ['read', 'projects', 'create', 'reread', 'image', 'save', 'publish']

const status = (code: number, over: Partial<Extract<FailedAnswer, { kind: 'status' }>> = {}): FailedAnswer => ({ kind: 'status', status: code, statusMessage: 'Refused', ...over })

const stopped = (code: Extract<DeckOutcome, { action: 'stopped' }>['code']): DeckOutcome => ({ action: 'stopped', code })

/** The outcome of each answer on each route of a deck. */
function expected(route: DeckRoute, name: string): DeckOutcome {
  switch (name) {
    case '301':
    case '302':
      return stopped('instance-redirect')
    case '400':
      return { action: 'refused', problem: 'instance-refused' }
    case '401':
      return stopped('token-refused')
    case '401 asking for a password':
      return { action: 'forbidden', reason: 'password' }
    case '403':
      return { action: 'forbidden', reason: 'refused' }
    case '404':
      return route === 'read' ? { action: 'absent' } : { action: 'forbidden', reason: 'refused' }
    case '409 with data.conflict':
      return route === 'create' ? { action: 'exists' } : { action: 'conflict' }
    case '409':
      return route === 'create' ? { action: 'exists' } : route === 'save' ? { action: 'live-session' } : { action: 'conflict' }
    case '413':
      return { action: 'refused', problem: route === 'image' ? 'image-refused' : 'deck-body-too-large' }
    case '415':
      return route === 'image' ? { action: 'refused', problem: 'image-refused' } : stopped('instance-error')
    case '429 of the requests of a token':
      return stopped('too-many-token-requests')
    case '429 of the refused tokens':
      return stopped('too-many-invalid-tokens')
    case 'a network error':
      return stopped('instance-unreachable')
    case 'a body outside its schema':
      return stopped('instance-answer')
    default:
      return stopped('instance-error')
  }
}

const ANSWERS: [string, FailedAnswer][] = [
  ['301', status(301)],
  ['302', status(302)],
  ['400', status(400)],
  ['401', status(401)],
  ['401 asking for a password', status(401, { data: { requiresPassword: true } })],
  ['403', status(403)],
  ['404', status(404)],
  ['409 with data.conflict', status(409, { data: { conflict: true } })],
  ['409', status(409)],
  ['411', status(411)],
  ['413', status(413)],
  ['415', status(415)],
  ['418, outside the table', status(418)],
  ['429 of the requests of a token', status(429, { statusMessage: TOO_MANY_TOKEN_REQUESTS })],
  ['429 of the refused tokens', status(429, { statusMessage: TOO_MANY_INVALID_TOKENS })],
  ['429 of another message', status(429)],
  ['500', status(500)],
  ['502', status(502)],
  ['503', status(503)],
  ['a network error', { kind: 'unreachable' }],
  ['a body outside its schema', { kind: 'unreadable' }],
]

describe('the answers of the routes of a deck (packages/cli/src/push-plan.ts)', () => {
  it.each(ROUTES.flatMap(route => ANSWERS.map(([name, answer]) => [route, name, answer] as const)))('gives the %s route its outcome for %s', (route, name, answer) => {
    expect(deckOutcome(route, answer)).toEqual(expected(route, name))
  })

  it('lets the next decks go after the codes 1, 4 and 5, and stops the command after the codes 3 and 6', () => {
    const exits = ANSWERS.flatMap(([, answer]) => ROUTES.map(route => deckOutcome(route, answer)))
      .flatMap(outcome => outcome.action === 'absent' ? [] : [outcomeExit(outcome)])
    for (const { exit, stops } of exits)
      expect(stops).toBe(exit === EXIT_CODES.authentication || exit === EXIT_CODES.instance)
    expect(new Set(exits.map(({ exit }) => exit))).toEqual(new Set([1, 3, 4, 5, 6]))
    expect(outcomeExit({ action: 'refused', problem: 'instance-refused' })).toEqual({ exit: EXIT_CODES.deckError, stops: false })
    expect(outcomeExit({ action: 'exists' })).toEqual({ exit: EXIT_CODES.conflict, stops: false })
    expect(outcomeExit(stopped('too-many-invalid-tokens'))).toEqual({ exit: EXIT_CODES.authentication, stops: true })
  })

  it('refuses a draft push did not send and an unfinished creation with the code 5, and gives each action its code', () => {
    expect(ACTION_EXIT_CODES).toEqual({
      'create': 0,
      'publish': 0,
      'created': 0,
      'published': 0,
      'identical': 0,
      'unpublished-draft': 5,
      'creation-unfinished': 5,
      'live-session': 5,
      'conflict': 5,
      'exists': 5,
      'digest-unchecked': 6,
      'forbidden': 4,
      'refused': 1,
      'stopped': 6,
      'skipped': 0,
    })
  })

  it('reads a 404 of the first read as an absent deck, then a 409 of the creation as a taken slug', () => {
    expect(deckOutcome('read', status(404))).toEqual({ action: 'absent' })
    expect(deckOutcome('create', status(409))).toEqual({ action: 'exists' })
    expect(deckOutcome('reread', status(404))).toEqual({ action: 'forbidden', reason: 'refused' })
  })

  it('stops on a save or a publication whose answer does not repeat the digest sent', () => {
    const digest = 'a'.repeat(64)
    expect(digestOutcome(digest, digest)).toBeNull()
    expect(digestOutcome(null, null)).toBeNull()
    for (const answered of [undefined, 'b'.repeat(64), null])
      expect(digestOutcome(digest, answered)).toEqual(stopped('digest-unchecked'))
    expect(digestOutcome(null, undefined)).toEqual(stopped('digest-unchecked'))
    expect(outcomeExit(stopped('digest-unchecked'))).toEqual({ exit: EXIT_CODES.instance, stops: true })
  })
})

// A made-up secret, and an instance in memory that answers each route of push
// as the studio does, but for the answer a test replaces: the creation keeps
// the draft of its creation, the save and the publication check the digest of
// the draft they replace or publish.
const SECRET = 'vgt_witness-secret-of-the-status-tests'
const ORIGIN = 'https://studio.example.test'
const PNG = Uint8Array.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0])

type Replace = (call: { route: DeckRoute, slug: string }) => Response | undefined

interface Instance {
  /** The role of the account of the token: `editor` is a global role. */
  role?: 'editor' | 'viewer'
  /** The decks on the instance before the command. */
  decks?: Record<string, RemoteDraft>
  folders?: { slug: string, myGrant?: string }[]
  /** Runs at each save, before its answer. */
  onSave?: (slug: string) => void
}

function instance(replace: Replace, setup: Instance = {}) {
  const calls: string[] = []
  const decks = new Map(Object.entries(setup.decks ?? {}))
  const reads = new Map<string, number>()
  const fetch: typeof globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input))
    const method = init.method ?? 'GET'
    calls.push(`${method} ${url.pathname}${url.search}`)
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined
    if (url.pathname === '/api/tokens/current')
      return Response.json({ login: 'ann', role: setup.role ?? 'editor', name: 'CLI', prefix: 'vgt_witness-', scope: 'write', expiresAt: '2027-01-01T00:00:00.000Z' })
    const slug = url.pathname === '/api/presentations' ? body.slug : url.pathname === '/api/media' ? url.searchParams.get('deck')! : url.pathname.split('/')[3] ?? ''
    let route: DeckRoute
    if (url.pathname === '/api/projects')
      route = 'projects'
    else if (url.pathname === '/api/media')
      route = 'image'
    else if (method === 'POST' && url.pathname === '/api/presentations')
      route = 'create'
    else if (method === 'PUT')
      route = 'save'
    else if (url.pathname.endsWith('/publish'))
      route = 'publish'
    else
      route = (reads.get(slug) ?? 0) === 0 ? 'read' : 'reread'
    if (route === 'read' || route === 'reread')
      reads.set(slug, (reads.get(slug) ?? 0) + 1)
    const replaced = replace({ route, slug })
    if (replaced)
      return replaced
    const deck = decks.get(slug)
    const conflict = () => Response.json({ statusCode: 409, statusMessage: 'Conflict', data: { conflict: true } }, { status: 409 })
    switch (route) {
      case 'projects':
        return Response.json(setup.folders ?? [])
      case 'read':
      case 'reread':
        return deck ? Response.json(deck) : Response.json({ statusCode: 404, statusMessage: 'Not found' }, { status: 404 })
      case 'create':
        decks.set(slug, { content: creationDraft(body.raw, body.project ? { project: body.project } : {}), from: 'draft', stamp: 1, publishedRaw: null, publishedVersion: null })
        return Response.json({ slug }, { status: 201 })
      case 'image':
        return Response.json({ src: `/media/${((init.body as FormData).get('file') as File).name}` })
      case 'save':
        setup.onSave?.(slug)
        if (!deck || body.draftDigest !== (deck.from === 'draft' ? await textDigest(deck.content) : null))
          return conflict()
        decks.set(slug, { ...deck, content: body.raw, from: 'draft', stamp: (deck.stamp ?? 0) + 1 })
        return Response.json({ ok: true, stamp: (deck.stamp ?? 0) + 1, draftDigest: body.draftDigest })
      case 'publish':
        if (!deck || deck.from !== 'draft' || body.digest !== await textDigest(deck.content))
          return conflict()
        decks.set(slug, { ...deck, publishedRaw: deck.content, publishedVersion: (deck.publishedVersion ?? 0) + 1 })
        return Response.json({ ok: true, bytes: 1, digest: body.digest })
    }
  }
  return { fetch, calls, decks }
}

let folder: string
beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'vignettes-statuses-'))
  writeFileSync(join(folder, 'first.md'), '---\ntitle: First\n---\n\n# One\n\n![a](./a.png)\n')
  writeFileSync(join(folder, 'second.md'), '---\ntitle: Second\n---\n\n# Two\n')
  writeFileSync(join(folder, 'third.md'), '---\ntitle: Third\nproject: cli\n---\n\n# Three\n')
  writeFileSync(join(folder, 'a.png'), PNG)
})
afterEach(() => rmSync(folder, { recursive: true }))

async function pushFiles(files: string[], replace: Replace, setup: Instance = {}, options: Record<string, unknown> = {}) {
  const { fetch, calls, decks } = instance(replace, setup)
  const run = await runCommand('push', { operands: files.map(file => join(folder, file)), fetch, options: { instance: ORIGIN, json: true, ...options }, environment: { token: SECRET, configHome: folder } })
  return { ...run, calls, decks, document: JSON.parse(run.stdout) }
}

const pushBoth = (replace: Replace, setup: Instance = {}) => pushFiles(['first.md', 'second.md'], replace, setup)

/** The text push sends for the file `name` of the folder. */
const sentOf = async (name: string) => (await readLocalDeck(join(folder, name))).sent

describe('the answers of an instance to push (packages/cli/src/commands/push.ts)', () => {
  const failing = ANSWERS.filter(([name]) => name !== 'a body outside its schema' && name !== 'a network error')
  // The decks of these tests have no folder: test 'keeps the results of the decks before a list of the folders that fails' reads the route of the folders.
  it.each(ROUTES.filter(route => route !== 'projects').flatMap(route => failing.map(([name, answer]) => [route, name, answer] as const)))('gives the %s route of the first deck its action and its code for %s, then sends or skips the second deck', async (route, name, answer) => {
    const status = answer.kind === 'status' ? answer : undefined
    const respond = () => Response.json({ statusCode: status!.status, statusMessage: status!.statusMessage, data: status!.data }, { status: status!.status, headers: status!.status < 400 ? { location: `/login?token=${SECRET}` } : {} })
    const run = await pushBoth(call => call.route === route && call.slug === 'first' ? respond() : undefined)
    const outcome = deckOutcome(route, answer)
    const [first, second] = run.document.results
    if (outcome.action === 'absent') {
      expect(first.action).toBe('created')
      expect(run.code).toBe(EXIT_CODES.success)
      return
    }
    const { exit, stops } = outcomeExit(outcome)
    expect(first.action).toBe(outcome.action)
    expect(run.code).toBe(exit)
    expect(second.action).toBe(stops ? 'skipped' : 'created')
    expect(run.stdout + run.stderr).not.toContain(SECRET)
  })

  it('refuses a deck on a 400 with the message of the server and the version of the command line, and sends the next decks', async () => {
    const run = await pushBoth(call => call.route === 'save' && call.slug === 'first' ? Response.json({ statusCode: 400, statusMessage: 'Invalid slug \u001B[31mred' }, { status: 400 }) : undefined)
    const [first, second] = run.document.results
    expect(first).toMatchObject({ action: 'refused', problems: [{ severity: 'error', code: 'instance-refused', message: expect.stringContaining('Invalid slug \u001B[31mred. Command line 0.1.0') }] })
    expect(second.action).toBe('created')
    expect(run.code).toBe(EXIT_CODES.deckError)
    const text = await runCommand('push', { operands: [join(folder, 'first.md')], fetch: instance(call => call.route === 'save' ? Response.json({ statusMessage: 'Invalid \u001B[2J' }, { status: 400 }) : undefined).fetch, options: { instance: ORIGIN }, environment: { token: SECRET, configHome: folder } })
    expect(text.stdout).toContain('Invalid [2J')
    expect([...text.stdout + text.stderr].filter(character => character < ' ' && character !== '\n')).toEqual([])
  })

  it('names each image it sends, in the result and in the text output, and an image the instance refuses with its reason', async () => {
    const name = (await readLocalDeck(join(folder, 'first.md'))).images[0]!.name
    const run = await pushBoth(() => undefined)
    expect(run.document.results.map((result: { files?: unknown }) => result.files)).toEqual([[{ path: './a.png', name }], undefined])
    const text = (options: Record<string, unknown>) => runCommand('push', { operands: [join(folder, 'first.md')], fetch: instance(() => undefined).fetch, options: { instance: ORIGIN, ...options }, environment: { token: SECRET, configHome: folder } })
    expect((await text({})).stdout).toContain(`  Sent ./a.png as /media/${name}.`)
    expect((await text({ 'dry-run': true })).stdout).toContain(`  Would send ./a.png as /media/${name}.`)
    const refusal = (data: unknown) => pushBoth(call => call.route === 'image' && call.slug === 'first' ? Response.json({ statusCode: 415, statusMessage: 'Unsupported image', data }, { status: 415 }) : undefined)
    const [refused] = (await refusal({ reason: 'type' })).document.results
    expect(refused).toMatchObject({ action: 'refused', files: [{ path: './a.png', name }], problems: [{ code: 'image-refused', message: 'The instance refused the image ./a.png: Unsupported image (reason type). Command line 0.1.0.' }] })
    expect((await refusal({ reason: `${SECRET} other` })).document.results[0].problems[0].message).toBe('The instance refused the image ./a.png: Unsupported image. Command line 0.1.0.')
  })

  it('refuses a deck with an error before any request, and names the version of the command line', async () => {
    writeFileSync(join(folder, 'first.md'), '---\ntitle: First\n---\n\n# One\n\n![a](./absent.png)\n')
    const run = await pushBoth(() => undefined)
    expect(run.document.results[0]).toMatchObject({ action: 'refused', message: 'first was not sent: fix its errors, then run the command again. Command line 0.1.0.' })
    expect(run.calls).toEqual([])
  })

  it.each(['save', 'publish'] as const)('stops after a %s whose answer does not repeat the digest, without another request, and names the two reads of pull', async (route) => {
    const run = await pushBoth(call => call.route === route ? Response.json({ ok: true, bytes: 1, stamp: 2 }) : undefined)
    const [first, second] = run.document.results
    expect(first).toMatchObject({ action: 'digest-unchecked', error: { code: 'digest-unchecked', message: expect.stringContaining('run vignettes pull first to read the published version, and vignettes pull first --draft to read the draft') } })
    expect(second.action).toBe('skipped')
    expect(run.code).toBe(EXIT_CODES.instance)
    expect(run.calls.at(-1)).toBe(route === 'save' ? 'PUT /api/presentations/first' : 'POST /api/presentations/first/publish')
  })

  it('stops on a network error and on an answer outside its schema, and skips the next decks', async () => {
    const unreachable = await pushBoth(call => call.route === 'image'
      ? (() => {
          throw new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } })
        })()
      : undefined)
    expect(unreachable.document.results.map((result: { action: string }) => result.action)).toEqual(['stopped', 'skipped'])
    expect(unreachable.code).toBe(EXIT_CODES.instance)
    const repeated = await pushBoth(call => call.route === 'read' ? Response.json({ content: `# ${SECRET}`, from: 'draft', stamp: 1, publishedRaw: null, publishedVersion: null }) : undefined)
    expect(repeated.document.results[0]).toMatchObject({ action: 'stopped', error: { code: 'instance-answer' } })
    expect(repeated.stdout).not.toContain(SECRET)
  })

  it('stops a created deck whose draft read again holds another text, with the code 5 and without a save or a publication', async () => {
    const run = await pushBoth(call => call.route === 'reread' && call.slug === 'first'
      ? Response.json({ content: '# SOMEONE ELSE TYPED THIS', from: 'draft', stamp: 2, publishedRaw: null, publishedVersion: null })
      : undefined)
    const [first, second] = run.document.results
    expect(first.action).toBe('conflict')
    expect(second.action).toBe('created')
    expect(run.code).toBe(EXIT_CODES.conflict)
    expect(run.calls.filter(call => call.endsWith('/first') || call.endsWith('/first/publish')).filter(call => !call.startsWith('GET'))).toEqual([])
  })

  it('saves with the digest of the draft it read and publishes with the digest of the text it sends', async () => {
    const published = '---\ntitle: First\n---\n\n# Old\n'
    const run = await pushFiles(['first.md'], () => undefined, { decks: { first: { content: published, from: 'published', stamp: null, publishedRaw: published, publishedVersion: 4 } } })
    expect(run.document.results[0]).toMatchObject({ action: 'published', warnings: [{ code: 'published-replaced' }] })
    expect(run.decks.get('first')!.publishedRaw).toBe(await sentOf('first.md'))
    const drafted = { content: '---\ntitle: First\n---\n\n# Theirs\n', from: 'draft' as const, stamp: 7, publishedRaw: published, publishedVersion: 4 }
    let copied = false
    const forced = await pushFiles(['first.md'], () => undefined, { decks: { first: drafted }, onSave: () => {
      copied = existsSync(join(folder, 'first.md.replaced-7'))
    } }, { force: true })
    expect(forced.document.results[0]).toMatchObject({ action: 'published', replaced: join(realpathSync(folder), 'first.md.replaced-7') })
    expect(copied).toBe(true)
    expect(readFileSync(join(folder, 'first.md.replaced-7'), 'utf8')).toBe(drafted.content)
    expect(forced.decks.get('first')!.publishedRaw).toBe(await sentOf('first.md'))
  })

  it('refuses a draft it did not send and an unfinished creation with the code 5, without a save or a publication', async () => {
    const foreign = await pushFiles(['first.md'], () => undefined, { decks: { first: { content: '# Theirs', from: 'draft', stamp: 1, publishedRaw: null, publishedVersion: null } } })
    expect(foreign.document.results[0].action).toBe('unpublished-draft')
    expect(foreign.code).toBe(EXIT_CODES.conflict)
    writeFileSync(join(folder, 'open.md'), '---\ntitle: Open\nstatus: public\n---\n\n# Open\n')
    const unfinished = await pushFiles(['open.md'], () => undefined, { decks: { open: { content: creationDraft(await sentOf('open.md'), {}), from: 'draft', stamp: 1, publishedRaw: null, publishedVersion: null } } })
    expect(unfinished.document.results[0].action).toBe('creation-unfinished')
    expect(unfinished.code).toBe(EXIT_CODES.conflict)
    expect([...foreign.calls, ...unfinished.calls].filter(call => !call.startsWith('GET') && !call.startsWith('POST /api/media'))).toEqual([])
  })

  it('refuses a deck to create without a folder for a collaborator, and a folder where the account may not create one, and sends the next decks', async () => {
    const collaborator = { role: 'viewer' as const, folders: [{ slug: 'cli', myGrant: 'editor' }] }
    const unfiled = await pushFiles(['first.md', 'third.md'], () => undefined, collaborator)
    expect(unfiled.document.results.map((result: { action: string }) => result.action)).toEqual(['refused', 'created'])
    expect(unfiled.document.results[0].error.code).toBe('folder-required')
    expect(unfiled.code).toBe(EXIT_CODES.usage)
    expect(unfiled.calls.filter(call => call.includes('first') && !call.startsWith('GET'))).toEqual([])
    for (const folders of [[{ slug: 'cli', myGrant: 'viewer' }], []]) {
      const refused = await pushFiles(['third.md', 'second.md'], () => undefined, { role: 'viewer', folders }, { folder: undefined })
      expect(refused.document.results[0]).toMatchObject({ action: 'forbidden', error: { code: 'folder-refused' } })
      expect(refused.code).toBe(EXIT_CODES.permission)
      expect(refused.calls.filter(call => call.includes('third') && !call.startsWith('GET'))).toEqual([])
    }
  })

  it('keeps the results of the decks before a list of the folders that fails', async () => {
    const published = '---\ntitle: First\n---\n\n# Old\n'
    const run = await pushFiles(['first.md', 'third.md'], call => call.route === 'projects' ? Response.json({ statusCode: 429, statusMessage: TOO_MANY_TOKEN_REQUESTS }, { status: 429 }) : undefined, { decks: { first: { content: published, from: 'published', stamp: null, publishedRaw: published, publishedVersion: 1 } } })
    expect(run.document.results).toMatchObject([{ action: 'published' }, { action: 'stopped', error: { code: 'too-many-token-requests' } }])
    expect(run.code).toBe(EXIT_CODES.instance)
  })
})
