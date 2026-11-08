import { defaults, seal, unseal } from 'iron-webcrypto'
import { serverConfig } from './config'

/**
 * The view pass of the deck origin, its tickets and the pass of the acceptance
 * kit are iron seals under the session secret, as the sessions of h3 are. Each
 * value names its `kind`, so that a seal made for one use opens for no other.
 */
interface Kinded {
  kind: string
}

/** The session secret, which seals the passes and signs the unlock cookies of `access-pass.ts`. */
export function secret(): string {
  const value = serverConfig().sessionPassword
  if (!value)
    throw createError({ statusCode: 500, statusMessage: 'NUXT_SESSION_PASSWORD is required to seal a pass or sign an unlock cookie' })
  return value
}

// iron-webcrypto declares the Web Crypto it takes with its own interface, whose
// `Uint8Array` the global one of the TypeScript library does not match: the
// value is the Web Crypto of Node, the one h3 passes it.
const webCrypto = globalThis.crypto as unknown as Parameters<typeof seal>[0]

/** Seals a value that opens for `ttlMs` milliseconds. */
export function sealed<T extends Kinded>(value: T, ttlMs: number): Promise<string> {
  return seal(webCrypto, value, secret(), { ...defaults, ttl: ttlMs })
}

/** The value of a seal of this kind, or `null` for a seal that is expired, forged or of another kind. */
export async function opened<T extends Kinded>(raw: string | undefined, kind: T['kind']): Promise<T | null> {
  if (!raw)
    return null
  // The server that seals is the one that opens: no clock skew to allow for.
  const value = await unseal(webCrypto, raw, secret(), { ...defaults, timestampSkewSec: 0 }).catch(() => null) as Kinded | null
  return value?.kind === kind ? value as T : null
}
