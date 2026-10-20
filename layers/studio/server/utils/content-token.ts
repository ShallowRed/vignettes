import type { H3Event } from 'h3'
import type { Actor } from './actor'
import { Buffer } from 'node:buffer'
import { timingSafeEqual } from 'node:crypto'
import { serverConfig } from './config'

/**
 * The content token lets the content scripts reach an instance without a
 * browser session: `content:republish --remote` through the routes that write a
 * deck from markdown (draft save, publish, draft read), and `content:push`,
 * `content:pull` and `theme:rename` through `/api/content/*`. Every other route
 * ignores it. It carries the editor role, never owner: users and grants stay
 * out of reach.
 */
export const CONTENT_TOKEN_LOGIN = 'content-token'

function sameSecret(provided: string, expected: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** The token actor when the request carries the configured bearer, else null. */
export function contentTokenActor(event: H3Event): Actor | null {
  const expected = serverConfig().contentToken
  if (!expected)
    return null
  const header = getRequestHeader(event, 'authorization') ?? ''
  const match = /^Bearer\s+(\S+)$/i.exec(header)
  if (!match || !sameSecret(match[1]!, expected))
    return null
  return { login: CONTENT_TOKEN_LOGIN, role: 'editor' }
}
