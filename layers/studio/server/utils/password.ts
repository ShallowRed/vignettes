// scrypt-based password hashing for semi-private presentations.

import { Buffer } from 'node:buffer'
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { isAccessPasswordHash } from '#shared/access/password-shape'

const scryptAsync = promisify(scrypt)

/** Hash a password for frontmatter storage (`salt:hash` format). */
export async function hashAccessPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const hash = (await scryptAsync(password, salt, 64)) as Buffer
  return `${salt}:${hash.toString('hex')}`
}

/** Verify a password against a stored `salt:hash`. */
export async function verifyAccessPassword(password: string, storedHash: string): Promise<boolean> {
  // A value of another shape denies: `timingSafeEqual` raises on buffers of
  // different lengths, which would answer 500 for the deck and for its images.
  if (!isAccessPasswordHash(storedHash))
    return false

  const [salt, hash] = storedHash.split(':') as [string, string]
  const hashBuffer = Buffer.from(hash, 'hex')
  const derivedHash = (await scryptAsync(password, salt, 64)) as Buffer

  return timingSafeEqual(hashBuffer, derivedHash)
}
