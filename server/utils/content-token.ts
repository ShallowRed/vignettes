import type { H3Event } from 'h3'
import type { Actor } from './actor'
import { Buffer } from 'node:buffer'
import { timingSafeEqual } from 'node:crypto'
import process from 'node:process'

/**
 * The content token lets `content:republish --remote` publish a deck from its
 * stub without a browser session. It is scoped: only the routes that write a
 * deck from markdown accept it (draft save, publish, draft read), so a leaked
 * token republishes decks and nothing else. It carries the editor role, never
 * owner: users and grants stay out of reach.
 */
export const CONTENT_TOKEN_LOGIN = 'content-token'

export function readContentToken(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.NUXT_CONTENT_TOKEN?.trim() || undefined
}

function sameSecret(provided: string, expected: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** The token actor when the request carries the configured bearer, else null. */
export function contentTokenActor(event: H3Event): Actor | null {
  const expected = readContentToken()
  if (!expected)
    return null
  const header = getRequestHeader(event, 'authorization') ?? ''
  const match = /^Bearer\s+(\S+)$/i.exec(header)
  if (!match || !sameSecret(match[1], expected))
    return null
  return { login: CONTENT_TOKEN_LOGIN, role: 'editor' }
}
