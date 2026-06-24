/**
 * Hocuspocus collaboration server.
 *
 * The Yjs WebSocket backend the integrated editor connects to for multi-user
 * editing. Design decision: **markdown stays the source of
 * truth**; Yjs is only the real-time transport. So this server bridges the live
 * `Y.Text` to the deck's `.md` file:
 *
 *   - onAuthenticate  → validate the session token (TODO: wire to nuxt-auth-utils;
 *                       for the exploration branch a shared dev token is accepted).
 *   - onLoadDocument  → seed the Y.Text from the deck's current markdown on first
 *                       open (so a fresh room starts from the committed file).
 *   - onStoreDocument → write the Y.Text back to the markdown file (debounced by
 *                       Hocuspocus), keeping the `.md` authoritative.
 *
 * Document name convention: "<access>:<slug>" (e.g. "public:example-minimal") —
 * the same key shape as the file storage, so the server resolves the path safely.
 *
 * Run standalone (like La Suite's y-provider):
 *   node --experimental-strip-types server/collab/hocuspocus.ts
 * or via the `collab` script. It is intentionally NOT part of the Nitro server.
 */

import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { Server } from '@hocuspocus/server'
import * as Y from 'yjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..', '..')
const PRESENTATIONS = join(ROOT, 'presentations')

const PORT = Number(process.env.COLLAB_PORT || 1234)
// Exploration-stage auth: a shared dev token. To replace with a real
// session check against nuxt-auth-utils (verify the cookie/JWT server-side).
const DEV_TOKEN = process.env.COLLAB_DEV_TOKEN || 'dev-token'

const ACCESS_FOLDERS = ['public', 'draft', 'private', 'semi-private']
const SLUG_RE = /^[a-z0-9][\w-]*$/i
/** The Y.Doc text field shared with y-codemirror.next. */
const TEXT_FIELD = 'codemirror'

/** Resolve a document name "<access>:<slug>" to a safe absolute .md path. */
function resolveDocPath(documentName: string): string | null {
  const sep = documentName.indexOf(':')
  if (sep === -1)
    return null
  const access = documentName.slice(0, sep)
  const slug = documentName.slice(sep + 1)
  if (!ACCESS_FOLDERS.includes(access) || !SLUG_RE.test(slug))
    return null
  return join(PRESENTATIONS, access, `${slug}.md`)
}

const server = new Server({
  port: PORT,
  name: 'nuxt-slides-collab',

  async onAuthenticate({ token }) {
    if (token !== DEV_TOKEN)
      throw new Error('Unauthorized')
    return { user: 'dev' }
  },

  async onLoadDocument({ documentName, document }) {
    // Seed only a genuinely empty room. Mutating the provided document and
    // returning it is the supported pattern; the length guard makes it idempotent
    // so a re-load (reconnect/unload cycle) never stacks a second copy onto the
    // existing text — the duplication bug that turned one deck into N.
    const ytext = document.getText(TEXT_FIELD)
    if (ytext.length > 0)
      return document

    const path = resolveDocPath(documentName)
    if (!path || !existsSync(path)) {
      console.warn(`[collab] no markdown for "${documentName}" — starting empty`)
      return document
    }
    const raw = await readFile(path, 'utf-8')
    // Re-check after the await: a concurrent load may have populated it while we
    // were reading the file (the race that produced the 4× growth with no client).
    if (ytext.length > 0)
      return document
    ytext.insert(0, raw)
    console.log(`[collab] loaded "${documentName}" (${raw.length} chars)`)
    return document
  },

  async onStoreDocument({ documentName, document }) {
    const path = resolveDocPath(documentName)
    if (!path) {
      console.warn(`[collab] refusing to store invalid doc name "${documentName}"`)
      return
    }
    const raw = document.getText(TEXT_FIELD).toString()
    if (raw.length === 0) {
      // Never let a transient empty state wipe the committed deck.
      console.warn(`[collab] skipping empty store for "${documentName}"`)
      return
    }
    await writeFile(path, raw, 'utf-8')
    console.log(`[collab] stored "${documentName}" (${raw.length} chars)`)
  },
})

server.listen().then(() => {
  console.log(`[collab] Hocuspocus listening on ws://localhost:${PORT}`)
})

// Keep a reference so `Y` is used even if tree-shakers get clever; also exported
// for potential programmatic use/tests.
export { server, Y }
