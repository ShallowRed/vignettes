import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { createEvent, getRequestProtocol, getResponseHeader, setResponseHeader } from 'h3'
import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('defineNitroPlugin', (plugin: unknown) => plugin)
vi.stubGlobal('getRequestProtocol', getRequestProtocol)
vi.stubGlobal('setResponseHeader', setResponseHeader)

const { default: securityHeaders } = await import('../../layers/studio/server/plugins/security-headers')

type Hook = (...args: any[]) => void
const hooks: Record<string, Hook> = {}
;(securityHeaders as (app: unknown) => void)({ hooks: { hook: (name: string, fn: Hook) => (hooks[name] = fn) } })

function request(headers: Record<string, string> = {}) {
  const headersSent: Record<string, unknown> = {}
  const res = { setHeader: (name: string, value: unknown) => (headersSent[name.toLowerCase()] = value), getHeader: (name: string) => headersSent[name.toLowerCase()] }
  return createEvent({ method: 'GET', url: '/', headers } as any, res as any)
}

describe('the security headers plugin', () => {
  it('sets HSTS on a request the proxy received over https only', () => {
    const secure = request({ 'x-forwarded-proto': 'https' })
    hooks.request!(secure)
    expect(getResponseHeader(secure, 'strict-transport-security')).toBe('max-age=31536000')
    const plain = request()
    hooks.request!(plain)
    expect(getResponseHeader(plain, 'strict-transport-security')).toBeUndefined()
  })

  it('gives the nonce to the renderer\'s scripts, never to the rendered body', () => {
    const event = request()
    const html = {
      head: ['<script type="importmap">{}</script><script type="module" src="/_nuxt/entry.js"></script>'],
      body: ['<div id="__nuxt"><script>injected()</script></div>'],
      bodyAppend: ['<script>window.__NUXT__={}</script>'],
    }
    hooks['render:html']!(html, { event })
    const policy = getResponseHeader(event, 'content-security-policy') as string
    const nonce = /'nonce-([^']+)'/.exec(policy)![1]
    expect(html.head[0]).toBe(`<script nonce="${nonce}" type="importmap">{}</script><script nonce="${nonce}" type="module" src="/_nuxt/entry.js"></script>`)
    expect(html.bodyAppend[0]).toBe(`<script nonce="${nonce}">window.__NUXT__={}</script>`)
    expect(html.body[0]).toBe('<div id="__nuxt"><script>injected()</script></div>')
  })

  it('draws a new nonce for each page', () => {
    const policies = [request(), request()].map((event) => {
      hooks['render:html']!({ head: [], body: [], bodyAppend: [] }, { event })
      return getResponseHeader(event, 'content-security-policy')
    })
    expect(policies[0]).not.toBe(policies[1])
  })

  it('drops the x-powered-by header of the renderer', () => {
    const response = { headers: { 'content-type': 'text/html', 'x-powered-by': 'Nuxt' } }
    hooks['render:response']!(response)
    expect(response.headers).toEqual({ 'content-type': 'text/html' })
  })

  it('lets the inline script of the installed reveal.js speaker view run', async () => {
    const { SPEAKER_VIEW_SCRIPT_HASH } = await import('../../layers/studio/server/utils/security-headers')
    // `useReveal.ts` imports this module, which holds the speaker view page as a string literal.
    const module = readFileSync(createRequire(import.meta.url).resolve('reveal.js/plugin/notes/notes.esm.js'), 'utf8')
    const literal = /"(?:[^"\\]|\\.)*<\/html>"/.exec(module)![0]
    const page = runInNewContext(literal) as string
    const script = /<script>([\s\S]*?)<\/script>/.exec(page)![1]!
    expect(SPEAKER_VIEW_SCRIPT_HASH).toBe(`sha256-${createHash('sha256').update(script).digest('base64')}`)
  })
})
