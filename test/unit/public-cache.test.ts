import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createServer } from 'node:http'
import { createApp, defineEventHandler, setCookie, setResponseHeader, toNodeListener } from 'h3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { dropCookiesOfPublicResponse } from '../../layers/studio/server/utils/public-cache'

// A server with the hook of the `public-cache` plugin, and routes that set a
// session cookie the way the readers of a session do.
let server: Server
let base: string
const errors: Error[] = []
beforeAll(async () => {
  const app = createApp({ onBeforeResponse: dropCookiesOfPublicResponse, onError: error => void errors.push(error) })
  const route = (cacheControl: string, cookie: string) => defineEventHandler((event) => {
    setCookie(event, 'nuxt-session', cookie)
    setResponseHeader(event, 'Cache-Control', cacheControl)
    return 'body'
  })
  app.use('/themes/probe.css/', route('public, max-age=300', 'Fe26.2**resealed'))
  app.use('/media/probe.svg', route('public, max-age=31536000, immutable', ''))
  app.use('/frozen/private/', route('private, no-store', 'Fe26.2**resealed'))
  // A cached handler of Nitro returns its body even when the response has
  // already left.
  app.use('/_i18n/probe/messages.json', defineEventHandler((event) => {
    setResponseHeader(event, 'Cache-Control', 'public, max-age=300')
    setResponseHeader(event, 'Content-Type', 'application/json')
    event.node.res.end('{}')
    return '{}'
  }))
  server = createServer(toNodeListener(app))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => {
  server.close()
})

describe('a response a shared cache may keep', () => {
  it('carries no cookie: neither a resealed session on a path ending with /, nor the clearing of an ended one', async () => {
    for (const path of ['/themes/probe.css/', '/media/probe.svg']) {
      const response = await fetch(base + path)
      expect(response.headers.get('cache-control')).toMatch(/^public/)
      expect(response.headers.get('set-cookie')).toBeNull()
    }
  })

  it('leaves a response that its handler has already sent', async () => {
    const response = await fetch(`${base}/_i18n/probe/messages.json`)
    expect(await response.text()).toBe('{}')
    expect(errors).toEqual([])
  })

  it('leaves the cookie of a private response', async () => {
    const response = await fetch(`${base}/frozen/private/`)
    expect(response.headers.get('set-cookie')).toMatch(/^nuxt-session=Fe26/)
  })
})
