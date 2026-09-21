/**
 * The shape `hashAccessPassword` writes: a 16-byte salt and a 64-byte scrypt
 * output, both in hexadecimal. A stored value of another shape denies rather
 * than raising, and a stub carrying one is refused before it reaches a database.
 */
export function isAccessPasswordHash(stored: string | null | undefined): boolean {
  return typeof stored === 'string' && /^[0-9a-f]{32}:[0-9a-f]{128}$/.test(stored)
}
