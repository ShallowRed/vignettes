// scrypt-based password hashing for semi-private presentations.

import type { ScryptParams } from '../../shared/access/password-shape.ts'
import { Buffer } from 'node:buffer'
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { CURRENT_PREFIX, CURRENT_SCRYPT, readAccessPasswordHash } from '../../shared/access/password-shape.ts'

function derive(password: string, salt: string, params: ScryptParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, params, (error, key) => error ? reject(error) : resolve(key))
  })
}

/** Hash a password for frontmatter storage (`scrypt$<log2 N>$<r>$<p>$<salt>$<hash>`). */
export async function hashAccessPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const hash = await derive(password, salt, CURRENT_SCRYPT)
  return `${CURRENT_PREFIX}${salt}$${hash.toString('hex')}`
}

/** Verify a password against a stored hash, with the parameters the hash names. */
export async function verifyAccessPassword(password: string, storedHash: string): Promise<boolean> {
  // A value of another shape denies: `timingSafeEqual` raises on buffers of
  // different lengths, which would answer 500 for the deck and for its images.
  const stored = readAccessPasswordHash(storedHash)
  if (!stored)
    return false
  return timingSafeEqual(Buffer.from(stored.hash, 'hex'), await derive(password, stored.salt, stored.params))
}

/** Whether a stored hash has parameters older than `CURRENT_SCRYPT`, to replace at the next right password. */
export function needsRehash(storedHash: string): boolean {
  return readAccessPasswordHash(storedHash)?.current === false
}
