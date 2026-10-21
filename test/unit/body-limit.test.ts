import { createError, createEvent, getRequestHeader } from 'h3'
import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('createError', createError)
vi.stubGlobal('getRequestHeader', getRequestHeader)

const { default: bodyLimit } = await import('../../layers/studio/server/middleware/body-limit')

const MB = 2 ** 20
function request(method: string, url: string, headers: Record<string, string>) {
  return createEvent({ method, url, headers } as any, {} as any)
}

describe('the body limit', () => {
  it('lets a deck save of 2 MB through, and refuses one above (413)', () => {
    expect(bodyLimit(request('PUT', '/api/presentations/deck', { 'content-length': String(2 * MB) }))).toBeUndefined()
    expect(() => bodyLimit(request('PUT', '/api/presentations/deck', { 'content-length': String(2 * MB + 1) })))
      .toThrow(expect.objectContaining({ statusCode: 413 }))
  })

  it('lets an image upload at the 10 MB limit through', () => {
    expect(bodyLimit(request('POST', '/api/media?deck=deck', { 'content-length': String(10 * MB + 4096) }))).toBeUndefined()
    expect(() => bodyLimit(request('POST', '/api/media?deck=deck', { 'content-length': String(12 * MB) })))
      .toThrow(expect.objectContaining({ statusCode: 413 }))
  })

  it('refuses a chunked body, which declares no length (411)', () => {
    expect(() => bodyLimit(request('POST', '/api/content/push', { 'transfer-encoding': 'chunked' })))
      .toThrow(expect.objectContaining({ statusCode: 411 }))
  })

  it('lets a request without a body through', () => {
    expect(bodyLimit(request('DELETE', '/api/presentations/deck', {}))).toBeUndefined()
    expect(bodyLimit(request('GET', '/api/presentations', { 'transfer-encoding': 'chunked' }))).toBeUndefined()
  })
})
