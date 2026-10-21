/**
 * The shapes of a stored deck password: `scrypt$<log2 N>$<r>$<p>$<salt>$<hash>`,
 * written by `hashAccessPassword`, and `<salt>:<hash>`, written before with the
 * default parameters of Node. The salt has 16 bytes and the hash 64, both in
 * hexadecimal. A stored value of another shape, or of other parameters, denies
 * access, and a stub carrying one is refused before it reaches a database.
 */

/** The scrypt parameters of a stored password. */
export interface ScryptParams {
  N: number
  r: number
  p: number
}

/**
 * The parameters `hashAccessPassword` writes: a set of the OWASP Password
 * Storage cheat sheet, 16 MiB per hash
 * (https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt).
 */
export const CURRENT_SCRYPT: ScryptParams = { N: 2 ** 14, r: 8, p: 5 }

/** The default parameters of Node, those of a `<salt>:<hash>` value. */
const LEGACY_SCRYPT: ScryptParams = { N: 2 ** 14, r: 8, p: 1 }

export const CURRENT_PREFIX = `scrypt$${Math.log2(CURRENT_SCRYPT.N)}$${CURRENT_SCRYPT.r}$${CURRENT_SCRYPT.p}$`

const CURRENT_SHAPE = new RegExp(`^${CURRENT_PREFIX.replaceAll('$', '\\$')}([0-9a-f]{32})\\$([0-9a-f]{128})$`)
const LEGACY_SHAPE = /^([0-9a-f]{32}):([0-9a-f]{128})$/

/** The salt, the hash and the parameters of a stored password; null for a value of another shape. */
export function readAccessPasswordHash(stored: string | null | undefined): { salt: string, hash: string, params: ScryptParams, current: boolean } | null {
  if (typeof stored !== 'string')
    return null
  const current = CURRENT_SHAPE.exec(stored)
  if (current)
    return { salt: current[1]!, hash: current[2]!, params: CURRENT_SCRYPT, current: true }
  const legacy = LEGACY_SHAPE.exec(stored)
  return legacy ? { salt: legacy[1]!, hash: legacy[2]!, params: LEGACY_SCRYPT, current: false } : null
}

export function isAccessPasswordHash(stored: string | null | undefined): boolean {
  return readAccessPasswordHash(stored) !== null
}
