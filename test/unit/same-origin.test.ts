import process from 'node:process'
import { createError, createEvent, getRequestHeader, getRequestURL } from 'h3'
import { afterAll, describe, expect, it, vi } from 'vitest'

// The guard reads the request through h3 itself: the origin of the instance is
// the one `getRequestURL` builds, as for the OAuth return address.
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('createError', createError)
vi.stubGlobal('getRequestHeader', getRequestHeader)
vi.stubGlobal('getRequestURL', getRequestURL)

process.env.NUXT_CONTENT_TOKEN = 'content-token-of-the-test'
afterAll(() => {
  delete process.env.NUXT_CONTENT_TOKEN
})

const { default: sameOrigin } = await import('../../layers/studio/server/middleware/same-origin')

const INSTANCE = { 'host': 'studio.example', 'x-forwarded-proto': 'https' }
function request(method: string, headers: Record<string, string>) {
  const req = { method, url: '/api/admin/projects', headers: { ...INSTANCE, ...headers } }
  return createEvent(req as any, {} as any)
}

describe('the same-origin guard', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('lets a %s from a page of the instance through', (method) => {
    expect(sameOrigin(request(method, { origin: 'https://studio.example' }))).toBeUndefined()
    expect(sameOrigin(request(method, { 'sec-fetch-site': 'same-origin' }))).toBeUndefined()
  })

  it.each([
    ['another site', { origin: 'https://other.example' }],
    ['a sibling subdomain', { origin: 'https://pages.studio.example' }],
    ['the same host over http', { origin: 'http://studio.example' }],
    ['an opaque origin', { origin: 'null' }],
    ['a same-site page', { 'sec-fetch-site': 'same-site' }],
    ['a request without either header', {}],
  ])('refuses a POST from %s (403)', (_from, headers) => {
    expect(() => sameOrigin(request('POST', headers))).toThrow(expect.objectContaining({ statusCode: 403 }))
  })

  it('compares the Origin with Host, whatever X-Forwarded-Host claims', () => {
    const forged = request('POST', { 'origin': 'https://other.example', 'x-forwarded-host': 'other.example' })
    expect(() => sameOrigin(forged)).toThrow(expect.objectContaining({ statusCode: 403 }))
  })

  it('lets a request carrying the content token through, and every GET', () => {
    expect(sameOrigin(request('PUT', { authorization: 'Bearer content-token-of-the-test' }))).toBeUndefined()
    expect(sameOrigin(request('GET', { origin: 'https://other.example' }))).toBeUndefined()
  })

  it('checks the origin of a request whose bearer is another token', () => {
    const forged = request('POST', { authorization: 'Bearer x', origin: 'https://other.example' })
    expect(() => sameOrigin(forged)).toThrow(expect.objectContaining({ statusCode: 403 }))
  })
})
