/**
 * The SHA-256 of some bytes, in lowercase hexadecimal, by the Web Crypto API
 * that Node and the browsers expose as a global.
 */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>))
  return Array.from(hash, byte => byte.toString(16).padStart(2, '0')).join('')
}

/** The digest of a text: the SHA-256 of its UTF-8 bytes. */
export function textDigest(text: string): Promise<string> {
  return sha256Hex(new TextEncoder().encode(text))
}
