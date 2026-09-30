import { Buffer } from 'node:buffer'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { serverConfig } from './config'

/**
 * The unlock cookie of a semi-private deck: `<expiry>.<signature>`, an HMAC of
 * the deck slug, the expiry and the stored password hash under the session secret.
 */

const TTL_MS = 24 * 60 * 60 * 1000

export function accessCookieName(slug: string): string {
  return `access_${slug}`
}

function secret(): string {
  const value = serverConfig().sessionPassword
  if (!value)
    throw createError({ statusCode: 500, statusMessage: 'NUXT_SESSION_PASSWORD is required to sign deck access cookies' })
  return value
}

function sign(slug: string, expiry: number, storedHash: string): string {
  return createHmac('sha256', secret()).update(`${slug}:${expiry}:${storedHash}`).digest('base64url')
}

export function mintAccessPass(slug: string, storedHash: string): { value: string, maxAge: number } {
  const expiry = Date.now() + TTL_MS
  return { value: `${expiry}.${sign(slug, expiry, storedHash)}`, maxAge: TTL_MS / 1000 }
}

export function verifyAccessPass(raw: string | undefined, slug: string, storedHash: string): boolean {
  if (!raw)
    return false
  const [expiryText, signature] = raw.split('.')
  const expiry = Number(expiryText)
  if (!signature || !Number.isInteger(expiry) || expiry <= Date.now())
    return false
  const expected = sign(slug, expiry, storedHash)
  return expected.length === signature.length && timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
}
