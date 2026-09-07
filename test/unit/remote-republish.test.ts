import { describe, expect, it } from 'vitest'
import { applyRemoteRepublish, planRemoteRepublish, RemoteError } from '../../scripts/lib/remote-republish.ts'

const stub = (slug: string, body: string) => ({ slug, raw: `---\ntitle: "T ${slug}"\n---\n\n# A\n\n---\n\n${body}\n` })

function fakeRemote(states: Record<string, any>) {
  const calls: { method: string, url: string, body?: any }[] = []
  const fetch = (async (url: string, init: any = {}) => {
    const method = init.method ?? 'GET'
    calls.push({ method, url, body: init.body ? JSON.parse(init.body) : undefined })
    const slug = decodeURIComponent(url.replace(/^https:\/\/x\/api\/presentations\//, '').replace(/\?draft$|\/publish$/, ''))
    if (init.headers?.authorization !== 'Bearer tok')
      return new Response(JSON.stringify({ statusMessage: 'Authentication required' }), { status: 401 })
    if (method === 'GET') {
      const state = states[slug]
      return state ? Response.json(state) : new Response('', { status: 404 })
    }
    if (method === 'PUT')
      return Response.json({ ok: true, stamp: 42 })
    return Response.json({ ok: true, bytes: 7 })
  }) as unknown as typeof fetch
  return { deps: { remote: 'https://x/', token: 'tok', fetch }, calls }
}

describe('planRemoteRepublish', () => {
  it('classes each stub against the remote state', async () => {
    const same = stub('same', 'body')
    const { deps } = fakeRemote({
      same: { content: same.raw, from: 'published', publishedRaw: same.raw, stamp: null },
      changed: { content: 'old', from: 'published', publishedRaw: 'old', stamp: null },
      edited: { content: 'online edit', from: 'draft', publishedRaw: 'old', stamp: 9 },
    })
    const plan = await planRemoteRepublish(deps, [same, stub('changed', 'new'), stub('edited', 'new'), stub('fresh', 'x')])
    expect(plan.map(i => [i.slug, i.action, i.slides, i.title])).toEqual([
      ['same', 'identical', 2, 'T same'],
      ['changed', 'republish', 2, 'T changed'],
      ['edited', 'unpublished-draft', 2, 'T edited'],
      ['fresh', 'create', 2, 'T fresh'],
    ])
  })

  it('overrides an unpublished online draft only with force', async () => {
    const { deps } = fakeRemote({ edited: { content: 'online', from: 'draft', publishedRaw: 'old', stamp: 9 } })
    const [item] = await planRemoteRepublish(deps, [stub('edited', 'new')], { force: true })
    expect(item).toMatchObject({ action: 'republish', stamp: 9 })
  })

  it('surfaces an authentication failure with its status', async () => {
    const { deps } = fakeRemote({})
    const attempt = () => planRemoteRepublish({ ...deps, token: 'wrong' }, [stub('a', 'x')])
    await expect(attempt()).rejects.toMatchObject({ status: 401 })
    await expect(attempt()).rejects.toBeInstanceOf(RemoteError)
  })
})

describe('applyRemoteRepublish', () => {
  it('saves the draft with the loaded stamp, then publishes, for writable items only', async () => {
    const { deps, calls } = fakeRemote({
      changed: { content: 'old', from: 'published', publishedRaw: 'old', stamp: 3 },
      same: { content: 'old', from: 'published', publishedRaw: stub('same', 'old').raw, stamp: null },
    })
    const plan = await planRemoteRepublish(deps, [stub('changed', 'new'), stub('same', 'old')])
    calls.length = 0
    const results = await applyRemoteRepublish(deps, plan)
    expect(results).toEqual([{ slug: 'changed', bytes: 7 }])
    expect(calls).toEqual([
      { method: 'PUT', url: 'https://x/api/presentations/changed', body: { raw: stub('changed', 'new').raw, stamp: 3 } },
      { method: 'POST', url: 'https://x/api/presentations/changed/publish', body: undefined },
    ])
  })
})
