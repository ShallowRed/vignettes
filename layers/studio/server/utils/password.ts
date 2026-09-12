// scrypt-based password hashing for semi-private presentations.

import { Buffer } from 'node:buffer'
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt)

/** Hash a password for frontmatter storage (`salt:hash` format). */
export async function hashAccessPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const hash = (await scryptAsync(password, salt, 64)) as Buffer
  return `${salt}:${hash.toString('hex')}`
}

/** Verify a password against a stored `salt:hash`. */
export async function verifyAccessPassword(password: string, storedHash: string): Promise<boolean> {
  const [salt, hash] = storedHash.split(':')
  if (!salt || !hash)
    return false

  const hashBuffer = Buffer.from(hash, 'hex')
  const derivedHash = (await scryptAsync(password, salt, 64)) as Buffer

  return timingSafeEqual(hashBuffer, derivedHash)
}
