/**
 * Republish decks on a remote instance from their stubs, through the same two
 * routes the editor uses (draft save, then publish), authenticated with the
 * content token. The remote database stays the truth: a draft edited online
 * and not yet published is never overwritten silently.
 */

export interface RemoteDeckState {
  content: string
  from: 'draft' | 'published'
  publishedRaw: string | null
  stamp: number | null
  title?: string
}

export interface RemoteDeps {
  remote: string
  token: string
  fetch: typeof fetch
}

export interface Stub { slug: string, raw: string }

export type RemoteAction = 'republish' | 'create' | 'identical' | 'unpublished-draft'

export interface RemotePlanItem {
  slug: string
  action: RemoteAction
  title: string | null
  slides: number
  stamp: number | null
  raw: string
}

export class RemoteError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

function headers(token: string, json = false): Record<string, string> {
  return { authorization: `Bearer ${token}`, ...(json ? { 'content-type': 'application/json' } : {}) }
}

function deckUrl(remote: string, slug: string): string {
  return `${remote.replace(/\/$/, '')}/api/presentations/${encodeURIComponent(slug)}`
}

async function failure(res: Response, what: string): Promise<RemoteError> {
  const body = await res.text().catch(() => '')
  let message = body
  try {
    message = JSON.parse(body)?.statusMessage ?? body
  }
  catch {}
  return new RemoteError(`${what} : ${res.status}${message ? ` ${message}` : ''}`, res.status)
}

/** The remote draft/published state, or null when the deck does not exist there. */
export async function loadRemoteDeck(deps: RemoteDeps, slug: string): Promise<RemoteDeckState | null> {
  const res = await deps.fetch(`${deckUrl(deps.remote, slug)}?draft`, { headers: headers(deps.token) })
  if (res.status === 404)
    return null
  if (!res.ok)
    throw await failure(res, `${slug} : lecture distante`)
  const data = await res.json()
  return {
    content: data.content,
    from: data.from,
    publishedRaw: data.publishedRaw ?? null,
    stamp: data.stamp ?? null,
    title: data.title,
  }
}

function titleOf(raw: string): string | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw)
  const line = match?.[1].split(/\r?\n/).find(l => l.startsWith('title:'))
  return line ? line.replace(/^title:\s*/, '').replace(/^["']|["']$/g, '') : null
}

function slidesOf(raw: string): number {
  const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
  return body.split(/\r?\n---\r?\n/).length
}

export async function planRemoteRepublish(
  deps: RemoteDeps,
  stubs: Stub[],
  opts: { force?: boolean } = {},
): Promise<RemotePlanItem[]> {
  const items: RemotePlanItem[] = []
  for (const stub of stubs) {
    const state = await loadRemoteDeck(deps, stub.slug)
    const base = { slug: stub.slug, title: titleOf(stub.raw), slides: slidesOf(stub.raw), raw: stub.raw, stamp: state?.stamp ?? null }
    if (!state) {
      items.push({ ...base, action: 'create' })
      continue
    }
    if (state.publishedRaw === stub.raw) {
      items.push({ ...base, action: 'identical' })
      continue
    }
    const unpublishedEdits = state.from === 'draft' && state.content !== state.publishedRaw
    if (unpublishedEdits && !opts.force) {
      items.push({ ...base, action: 'unpublished-draft' })
      continue
    }
    items.push({ ...base, action: 'republish' })
  }
  return items
}

export interface RemoteResult { slug: string, bytes: number }

/** Save the draft then publish it, for every item the plan marked writable. */
export async function applyRemoteRepublish(deps: RemoteDeps, items: RemotePlanItem[]): Promise<RemoteResult[]> {
  const results: RemoteResult[] = []
  for (const item of items) {
    if (item.action !== 'republish' && item.action !== 'create')
      continue
    const url = deckUrl(deps.remote, item.slug)
    const saved = await deps.fetch(url, {
      method: 'PUT',
      headers: headers(deps.token, true),
      body: JSON.stringify({ raw: item.raw, stamp: item.stamp }),
    })
    if (!saved.ok)
      throw await failure(saved, `${item.slug} : enregistrement du brouillon`)
    const published = await deps.fetch(`${url}/publish`, { method: 'POST', headers: headers(deps.token) })
    if (!published.ok)
      throw await failure(published, `${item.slug} : publication`)
    const data = await published.json().catch(() => ({}))
    results.push({ slug: item.slug, bytes: data.bytes ?? 0 })
  }
  return results
}
