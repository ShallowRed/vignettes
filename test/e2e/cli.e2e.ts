import type { Page } from '@playwright/test'
import type { CliCase, SeededToken } from './fixtures/cli-cases.ts'
import type { Relay } from './fixtures/cli-relay.ts'
import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { expect, test } from '@playwright/test'
import { applyRemoteRepublish, planRemoteRepublish } from '../../scripts/lib/remote-republish.ts'
import { tokensFile } from './fixtures/cli-cases.ts'
import { startRelay, writes } from './fixtures/cli-relay.ts'

// The command line against the servers of playwright.config.ts, through a
// relay that counts the requests of each token and can cut an answer. Each case
// has its own token, drawn at random by fixtures/cli-seed.ts at each run.

const CLI = resolve('packages/cli/src/cli.ts')
const SERVERS = {
  first: { port: 3210, host: 'localhost:3210', database: '.data/e2e-pglite' },
  origins: { port: 3211, host: 'app.localhost:3211', database: '.data/e2e-origins-pglite' },
} as const
type Server = keyof typeof SERVERS
const STUDIO = 'http://app.localhost:3211'
const CONTENT_TOKEN = 'e2e-content-token-not-a-secret-0000'
const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'))
// A server kept between two runs, or a retry, holds the decks of the earlier run.
const RUN = randomBytes(3).toString('hex')
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>\n'

function token(server: Server, name: CliCase): string {
  const seeded = JSON.parse(readFileSync(tokensFile(SERVERS[server].database), 'utf8')) as Record<string, SeededToken>
  return seeded[name]!.secret
}

interface Run {
  status: number | null
  stdout: string
  stderr: string
  // The JSON document of the command.
  document: { ok: boolean, results: Record<string, any>[], error?: { code: string } }
}

/** Runs the command line from its sources in `cwd`, with `--json`. */
function vignettes(args: string[], options: { cwd: string, origin: string, token: string }): Promise<Run> {
  return new Promise((done, failed) => {
    const child = spawn(process.execPath, [CLI, ...args, '--json'], {
      cwd: options.cwd,
      env: { PATH: process.env.PATH, HOME: options.cwd, XDG_CONFIG_HOME: join(options.cwd, '.config'), VIGNETTES_INSTANCE: options.origin, VIGNETTES_TOKEN: options.token },
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => stdout += chunk)
    child.stderr.on('data', chunk => stderr += chunk)
    child.on('error', failed)
    child.on('close', (status) => {
      // The secret reaches no output of the command line.
      expect(stdout + stderr).not.toContain(options.token)
      done({ status, stdout, stderr, document: JSON.parse(stdout) })
    })
  })
}

/** A case: its token, a relay to its server and a folder of decks; the relay checks the requests of the token at the end. */
async function setup(server: Server, name: CliCase) {
  const relay = await startRelay(SERVERS[server])
  const folder = mkdtempSync(join(tmpdir(), `vignettes-e2e-${name}-`))
  const secret = token(server, name)
  const owner = token(server, 'owner')
  let budget = 0
  const push = async (args: string[], expected?: number) => {
    const before = relay.requests.length
    const run = await vignettes(['push', ...args], { cwd: folder, origin: relay.origin, token: secret })
    // No more requests than the command counted before the first one.
    if (expected !== undefined)
      expect(relay.requests.length - before).toBeLessThanOrEqual(expected)
    budget += relay.requests.length - before
    return run
  }
  return {
    relay,
    folder,
    secret,
    push,
    write: (file: string, text: string | Uint8Array) => writeFileSync(join(folder, file), text),
    /** A request of the owner straight to the server, as someone else in the studio. */
    owner: (method: string, path: string, body?: unknown) => fetch(`http://127.0.0.1:${SERVERS[server].port}${path}`, {
      method,
      headers: { authorization: `Bearer ${owner}`, host: SERVERS[server].host, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    async close() {
      expect(relay.count(secret)).toBe(budget)
      await relay.close()
      rmSync(folder, { recursive: true })
    },
  }
}

type Case = Awaited<ReturnType<typeof setup>>

const deck = (title: string, body: string, front = '') => `---\ntitle: ${title}\nproject: cli\n${front}---\n\n# ${title}\n\n${body}\n`

/** The writes the relay passed on, as `METHOD path`. */
const writesOf = (relay: Relay, from = 0) => relay.requests.slice(from).filter(request => request.method !== 'GET').map(request => `${request.method} ${request.path}`)

/** Opens the studio of the second server as the persona `editor`, of a global role, through the owner token. */
async function signInAsEditor(page: Page, owner: string) {
  await page.goto(`${STUDIO}/login`)
  const answered = await page.evaluate(token => fetch('/auth/recette', {
    method: 'POST',
    headers: { 'authorization': `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ as: 'editor' }),
    // The redirection after the sign-in would carry the token to a page.
    redirect: 'manual',
  }).then(response => response.type), owner)
  expect(answered).toBe('opaqueredirect')
}

async function textOf(c: Case, slug: string, draft = false) {
  const response = await c.owner('GET', `/api/presentations/${slug}/markdown${draft ? '?draft' : ''}`)
  return response.ok ? response.text() : null
}

test.describe('vignettes push', () => {
  test('creates a deck in a folder with its local images, as a collaborator, and leaves it private', async () => {
    const c = await setup('first', 'create')
    try {
      c.write('logo.svg', SVG)
      c.write('photo.png', PNG)
      c.write(`cli-create-${RUN}.md`, deck('Created', '![photo](./photo.png)', 'brand:\n  operator: ./logo.svg\n'))
      const run = await c.push([`cli-create-${RUN}.md`], 2 + 5 + 2)
      expect(run.status).toBe(0)
      expect(run.document.results).toEqual([expect.objectContaining({ slug: `cli-create-${RUN}`, action: 'created', url: `${c.relay.origin}/edit/cli-create-${RUN}`, problems: [], warnings: [] })])
      expect(writesOf(c.relay)).toEqual(['POST /api/presentations', `POST /api/media?deck=cli-create-${RUN}`, `POST /api/media?deck=cli-create-${RUN}`, `PUT /api/presentations/cli-create-${RUN}`, `POST /api/presentations/cli-create-${RUN}/publish`])
      const published = await textOf(c, `cli-create-${RUN}`)
      expect(published).toMatch(/operator: \/media\/[0-9a-f]{32}\.svg\n/)
      expect(published).toMatch(/!\[photo\]\(\/media\/[0-9a-f]{32}\.png\)/)
      expect(readFileSync(join(c.folder, `cli-create-${RUN}.md`), 'utf8')).toContain('./photo.png')
      const answer = await (await c.owner('GET', `/api/presentations/cli-create-${RUN}`)).json()
      expect(answer.status).toBe('private')
    }
    finally {
      await c.close()
    }
  })

  test('sends no request for a deck with an error', async () => {
    const c = await setup('first', 'check-error')
    try {
      c.write(`cli-error-${RUN}.md`, deck('Error', '![absent](./absent.png)'))
      const run = await c.push([`cli-error-${RUN}.md`])
      expect(run.status).toBe(1)
      expect(run.document.results[0]).toMatchObject({ action: 'refused', problems: [expect.objectContaining({ code: 'image-missing' })] })
      expect(c.relay.requests).toEqual([])
    }
    finally {
      await c.close()
    }
  })

  test('reads alone under --dry-run, and the next run sends the writes it listed', async () => {
    const c = await setup('first', 'dry-run')
    try {
      c.write('photo.png', PNG)
      c.write(`cli-dry-run-${RUN}.md`, deck('Dry run', '![photo](./photo.png)'))
      const dry = await c.push([`cli-dry-run-${RUN}.md`, '--dry-run'])
      expect(dry.status).toBe(0)
      const [planned] = dry.document.results
      expect(planned).toMatchObject({ action: 'create', files: [{ path: './photo.png', name: expect.stringMatching(/^[0-9a-f]{32}\.png$/) }] })
      expect(writesOf(c.relay)).toEqual([])
      const from = c.relay.requests.length
      expect((await c.push([`cli-dry-run-${RUN}.md`])).document.results[0]!.action).toBe('created')
      expect(writesOf(c.relay, from)).toEqual(planned!.writes)
    }
    finally {
      await c.close()
    }
  })

  test('publishes when it runs again after an answer lost at each write, and the deck stays private', async () => {
    const c = await setup('first', 'resume')
    try {
      c.write('photo.png', PNG)
      const source = readFileSync('test/e2e/fixtures/decks/composants.md', 'utf8').replace('title: "Composants"', 'title: "Composants"\nproject: cli')
      for (const [index, path] of [/^\/api\/presentations$/, /^\/api\/media/, /^\/api\/presentations\/[^/]+$/, /\/publish$/].entries()) {
        const slug = `cli-resume-${index}-${RUN}`
        c.write(`${slug}.md`, `${source}\n![photo](./photo.png)\n`)
        c.relay.rule({ matches: writes(path), cut: true })
        const cut = await c.push([`${slug}.md`], 2 + 5 + 1)
        expect(cut.status).toBe(6)
        expect(cut.document.results[0]).toMatchObject({ action: 'stopped', error: { code: 'instance-unreachable' } })
        const again = await c.push([`${slug}.md`], 2 + 5 + 1)
        expect(again.status, again.stdout).toBe(0)
        // After the publication, the published version is the text: the run uploads the image again.
        expect(again.document.results[0]!.action).toBe(index === 3 ? 'identical' : 'published')
        expect((await (await c.owner('GET', `/api/presentations/${slug}`)).json()).status).toBe('private')
      }
    }
    finally {
      await c.close()
    }
  })

  test('stops on a save whose answer lacks the digest, without publishing, and skips the next decks', async () => {
    const c = await setup('first', 'digest-unchecked')
    try {
      c.write(`cli-unchecked-${RUN}.md`, deck('Unchecked', 'Text.'))
      c.write(`cli-unchecked-next-${RUN}.md`, deck('Next', 'Text.'))
      c.relay.rule({ matches: request => request.method === 'PUT', strip: 'draftDigest' })
      const run = await c.push([`cli-unchecked-${RUN}.md`, `cli-unchecked-next-${RUN}.md`])
      expect(run.status).toBe(6)
      expect(run.document.results.map(result => result.action)).toEqual(['digest-unchecked', 'skipped'])
      expect(run.document.results[0]!.error.code).toBe('digest-unchecked')
      expect(writesOf(c.relay)).toEqual(['POST /api/presentations', `PUT /api/presentations/cli-unchecked-${RUN}`])
      expect(await textOf(c, `cli-unchecked-${RUN}`)).toBeNull()
    }
    finally {
      await c.close()
    }
  })

  test('uploads each image again after an upload refused, and the instance serves each image of the published text', async ({ page }) => {
    const c = await setup('origins', 'upload-resume')
    try {
      c.write('photo.png', PNG)
      // The form of `stringifyDocument`, which a pulled file has.
      c.write(`cli-upload-${RUN}.md`, `---\ntitle: Upload\nproject: cli\n---\n\n# Upload\n\n![photo](./photo.png)\n`)
      c.relay.rule({ matches: writes(/^\/api\/media/), refuse: true })
      const refused = await c.push([`cli-upload-${RUN}.md`])
      expect(refused.document.results[0]).toMatchObject({ action: 'stopped', error: { code: 'instance-error' } })
      const again = await c.push([`cli-upload-${RUN}.md`])
      expect(again.document.results[0]!.action).toBe('published')
      const published = (await textOf(c, `cli-upload-${RUN}`))!
      const names = [...published.matchAll(/\/media\/[0-9a-f]{32}\.png/g)].map(match => match[0])
      expect(names).toHaveLength(1)
      await signInAsEditor(page, token('origins', 'owner'))
      for (const name of names) {
        const response = await page.goto(`${STUDIO}${name}`)
        expect(response!.status()).toBe(200)
        expect(new Uint8Array(await response!.body())).toEqual(PNG)
      }
    }
    finally {
      await c.close()
    }
  })

  test('uploads an image the published version cites already under the same name, and finds the deck identical', async () => {
    const c = await setup('first', 'same-image')
    try {
      c.write('photo.png', PNG)
      c.write(`cli-same-${RUN}.md`, deck('Same', '![photo](./photo.png)'))
      expect((await c.push([`cli-same-${RUN}.md`])).document.results[0]!.action).toBe('created')
      const from = c.relay.requests.length
      const again = await c.push([`cli-same-${RUN}.md`], 2 + 5 + 1)
      expect(again.document.results[0]).toMatchObject({ action: 'identical', warnings: [] })
      expect(writesOf(c.relay, from)).toEqual([`POST /api/media?deck=cli-same-${RUN}`])
    }
    finally {
      await c.close()
    }
  })

  test('refuses a draft of someone else, then publishes over it with --force after a copy', async () => {
    const c = await setup('first', 'force')
    try {
      c.write(`cli-force-${RUN}.md`, deck('Force', 'Mine.'))
      expect((await c.push([`cli-force-${RUN}.md`])).document.results[0]!.action).toBe('created')
      const read = await (await c.owner('GET', `/api/presentations/cli-force-${RUN}?draft`)).json()
      const theirs = deck('Force', 'Theirs.')
      expect((await c.owner('PUT', `/api/presentations/cli-force-${RUN}`, { raw: theirs, stamp: read.stamp })).status).toBe(200)
      c.write(`cli-force-${RUN}.md`, deck('Force', 'Mine again.'))
      const refused = await c.push([`cli-force-${RUN}.md`])
      expect(refused.status).toBe(5)
      expect(refused.document.results[0]!.action).toBe('unpublished-draft')
      const forced = await c.push([`cli-force-${RUN}.md`, '--force'])
      expect(forced.status).toBe(0)
      const [result] = forced.document.results
      expect(result).toMatchObject({ action: 'published', replaced: expect.stringMatching(new RegExp(`cli-force-${RUN}\\.md\\.replaced-\\d+$`)) })
      expect(readFileSync(result!.replaced, 'utf8')).toBe(theirs)
      expect(readdirSync(c.folder).filter(file => file.endsWith('.md'))).toEqual([`cli-force-${RUN}.md`])
    }
    finally {
      await c.close()
    }
  })

  test('stops on a draft saved by someone else between the read and the save', async () => {
    const c = await setup('first', 'conflict')
    try {
      c.write(`cli-conflict-${RUN}.md`, deck('Conflict', 'One.'))
      expect((await c.push([`cli-conflict-${RUN}.md`])).document.results[0]!.action).toBe('created')
      c.write(`cli-conflict-${RUN}.md`, deck('Conflict', 'Two.'))
      c.relay.rule({
        matches: request => request.method === 'PUT',
        before: async () => {
          const read = await (await c.owner('GET', `/api/presentations/cli-conflict-${RUN}?draft`)).json()
          expect((await c.owner('PUT', `/api/presentations/cli-conflict-${RUN}`, { raw: deck('Conflict', 'Theirs.'), stamp: read.stamp })).status).toBe(200)
        },
      })
      const run = await c.push([`cli-conflict-${RUN}.md`])
      expect(run.status).toBe(5)
      expect(run.document.results[0]!.action).toBe('conflict')
      expect(await textOf(c, `cli-conflict-${RUN}`, true)).toBe(deck('Conflict', 'Theirs.'))
    }
    finally {
      await c.close()
    }
  })

  test('stops on a deck open in the editor', async ({ page }) => {
    const c = await setup('origins', 'live-session')
    try {
      c.write(`cli-live-${RUN}.md`, deck('Live', 'One.'))
      expect((await c.push([`cli-live-${RUN}.md`])).document.results[0]!.action).toBe('created')
      await signInAsEditor(page, token('origins', 'owner'))
      const socket = page.waitForEvent('websocket')
      await page.goto(`${STUDIO}/edit/cli-live-${RUN}`)
      await (await socket).waitForEvent('framereceived')
      c.write(`cli-live-${RUN}.md`, deck('Live', 'Two.'))
      const run = await c.push([`cli-live-${RUN}.md`])
      expect(run.status).toBe(5)
      expect(run.document.results[0]!.action).toBe('live-session')
    }
    finally {
      await c.close()
    }
  })

  test('finds a deck whose published version is the text sent identical, and runs content:republish:prod with its own requests', async () => {
    const c = await setup('first', 'identical')
    try {
      c.write(`cli-identical-${RUN}.md`, deck('Identical', 'Text.'))
      expect((await c.push([`cli-identical-${RUN}.md`])).document.results[0]!.action).toBe('created')
      const again = await c.push([`cli-identical-${RUN}.md`])
      expect(again.document.results[0]!.action).toBe('identical')
      // The script of the content repository, with the content token, through the same relay.
      const from = c.relay.requests.length
      const deps = { remote: c.relay.origin, token: CONTENT_TOKEN, fetch }
      const items = await planRemoteRepublish(deps, [{ slug: `cli-identical-${RUN}`, raw: deck('Identical', 'Republished.') }])
      expect(items.map(item => item.action)).toEqual(['republish'])
      await applyRemoteRepublish(deps, items)
      expect(c.relay.requests.slice(from).map(request => `${request.method} ${request.path}`)).toEqual([`GET /api/presentations/cli-identical-${RUN}?draft`, `PUT /api/presentations/cli-identical-${RUN}`, `POST /api/presentations/cli-identical-${RUN}/publish`])
      expect(await textOf(c, `cli-identical-${RUN}`)).toBe(deck('Identical', 'Republished.'))
    }
    finally {
      await c.close()
    }
  })
})
