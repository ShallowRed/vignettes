import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import process from 'node:process'
import { createError, createEvent, getRequestURL } from 'h3'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { requestOrigin, requestSide, upgradeOrigin } from '../../layers/studio/server/utils/deck-origin'

// The side of a request rests on the host h3 reads, not on a stand-in for it.
vi.stubGlobal('getRequestURL', getRequestURL)
vi.stubGlobal('createError', createError)

beforeAll(() => {
  process.env.NUXT_PUBLIC_DECKS_URL = 'https://decks.example'
  process.env.NUXT_STUDIO_URL = 'https://app.example'
})
afterAll(() => {
  delete process.env.NUXT_PUBLIC_DECKS_URL
  delete process.env.NUXT_STUDIO_URL
})

function request(headers: Record<string, string>) {
  const req = new IncomingMessage(new Socket())
  req.url = '/slides/talk'
  req.method = 'GET'
  req.headers = headers
  return createEvent(req, new ServerResponse(req))
}

describe('the host of a request', () => {
  it('is the Host header, whatever X-Forwarded-Host names', () => {
    const event = request({ 'host': 'app.example', 'x-forwarded-host': 'decks.example' })
    expect(new URL(requestOrigin(event)).host).toBe('app.example')
    expect(requestSide(event)).toBe('studio')
    expect(requestSide(request({ 'host': 'decks.example', 'x-forwarded-host': 'app.example' }))).toBe('decks')
  })

  it('refuses with a 400 a Host header that is not a valid host, on a request and on a WebSocket upgrade', () => {
    expect(() => requestOrigin(request({ host: 'app example' }))).toThrow(expect.objectContaining({ statusCode: 400 }))
    let refusal: unknown
    try {
      upgradeOrigin({ url: 'http://app example/collab?deck=talk' } as Request)
    }
    catch (error) {
      refusal = error
    }
    expect(refusal).toBeInstanceOf(Response)
    expect((refusal as Response).status).toBe(400)
  })
})
