import { createHash } from 'node:crypto'
import { DECK_MESSAGES, speakerViewPage } from '@vignettes/core/render'
import { createEvent, getRequestProtocol, getResponseHeader, setResponseHeader } from 'h3'
import { describe, expect, it, vi } from 'vitest'
import { installedSpeakerView } from './helpers/fixtures'

vi.stubGlobal('defineNitroPlugin', (plugin: unknown) => plugin)
vi.stubGlobal('getRequestProtocol', getRequestProtocol)
vi.stubGlobal('setResponseHeader', setResponseHeader)

const { default: securityHeaders } = await import('../../layers/studio/server/plugins/security-headers')
const { readTelemetryOrigins } = await import('../../layers/studio/server/utils/config')

type Hook = (...args: any[]) => void
const hooks: Record<string, Hook> = {}
;(securityHeaders as (app: unknown) => void)({ hooks: { hook: (name: string, fn: Hook) => (hooks[name] = fn) } })

function request(headers: Record<string, string> = {}) {
  const headersSent: Record<string, unknown> = {}
  const res = { setHeader: (name: string, value: unknown) => (headersSent[name.toLowerCase()] = value), getHeader: (name: string) => headersSent[name.toLowerCase()] }
  return createEvent({ method: 'GET', url: '/', headers } as any, res as any)
}

describe('readTelemetryOrigins', () => {
  it('reads the origin of an address and of a DSN', () => {
    expect(readTelemetryOrigins({
      NUXT_PUBLIC_UMAMI_HOST: 'https://stats.example.org/',
      NUXT_PUBLIC_UMAMI_STUDIO_WEBSITE_ID: 'studio',
      NUXT_PUBLIC_ERROR_TRACKING_DSN: 'https://key@errors.example.org/1',
    })).toEqual(['https://stats.example.org', 'https://errors.example.org'])
  })

  it('names a service once', () => {
    expect(readTelemetryOrigins({
      NUXT_PUBLIC_UMAMI_HOST: 'https://telemetry.example.org',
      NUXT_PUBLIC_UMAMI_DECKS_WEBSITE_ID: 'decks',
      NUXT_PUBLIC_ERROR_TRACKING_DSN: 'https://key@telemetry.example.org/1',
    })).toEqual(['https://telemetry.example.org'])
  })

  it.each(['', '   ', 'foo:bar', 'http://stats.example.org', 'not an address'])('leaves out %j', (value) => {
    expect(readTelemetryOrigins({ NUXT_PUBLIC_UMAMI_HOST: value, NUXT_PUBLIC_UMAMI_STUDIO_WEBSITE_ID: 'studio' })).toEqual([])
  })

  it('leaves out an Umami address without a website, which measures nothing', () => {
    expect(readTelemetryOrigins({ NUXT_PUBLIC_UMAMI_HOST: 'https://stats.example.org' })).toEqual([])
  })

  it('reads nothing without a variable', () => {
    expect(readTelemetryOrigins({})).toEqual([])
  })
})

describe('the security headers plugin', () => {
  it('sets HSTS on a request the proxy received over https only', () => {
    const secure = request({ 'x-forwarded-proto': 'https' })
    hooks.request!(secure)
    expect(getResponseHeader(secure, 'strict-transport-security')).toBe('max-age=63072000; includeSubDomains')
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

  it('keeps connect-src on the origin of the page without a telemetry service', () => {
    vi.stubEnv('NUXT_PUBLIC_UMAMI_HOST', undefined)
    vi.stubEnv('NUXT_PUBLIC_ERROR_TRACKING_DSN', undefined)
    const event = request()
    hooks['render:html']!({ head: [], body: [], bodyAppend: [] }, { event })
    vi.unstubAllEnvs()
    const policy = getResponseHeader(event, 'content-security-policy') as string
    expect(policy).toContain('connect-src \'self\';')
  })

  it('adds the telemetry services to connect-src, and to no other directive', () => {
    vi.stubEnv('NUXT_PUBLIC_UMAMI_HOST', 'https://stats.example.org')
    vi.stubEnv('NUXT_PUBLIC_UMAMI_STUDIO_WEBSITE_ID', 'studio')
    vi.stubEnv('NUXT_PUBLIC_ERROR_TRACKING_DSN', 'https://key@errors.example.org/1')
    const event = request()
    hooks['render:html']!({ head: [], body: [], bodyAppend: [] }, { event })
    vi.unstubAllEnvs()
    const policy = getResponseHeader(event, 'content-security-policy') as string
    expect(policy).toContain('connect-src \'self\' https://stats.example.org https://errors.example.org;')
    expect(policy.match(/stats\.example\.org/g)).toHaveLength(1)
    expect(policy.match(/errors\.example\.org/g)).toHaveLength(1)
  })

  it('lets the inline script of the installed reveal.js speaker view run, in each deck language', async () => {
    const { SPEAKER_VIEW_SCRIPT_HASHES } = await import('../../layers/studio/server/utils/security-headers')
    const hashes = Object.fromEntries(Object.entries(DECK_MESSAGES).map(([lang, messages]) => {
      const script = /<script>([\s\S]*?)<\/script>/.exec(speakerViewPage(installedSpeakerView(), messages))![1]!
      return [lang, `sha256-${createHash('sha256').update(script).digest('base64')}`]
    }))
    expect(SPEAKER_VIEW_SCRIPT_HASHES).toEqual(hashes)
  })
})
