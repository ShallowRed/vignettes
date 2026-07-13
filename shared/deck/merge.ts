export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Recursively merge `override` onto `base`. Plain objects merge deeply; scalars
 * and arrays replace. `null`/`undefined` overrides are ignored so a stray empty
 * note key can't wipe a base default.
 */
export function deepMerge<T extends Record<string, unknown>>(
  base: T,
  override: Record<string, unknown>,
): T {
  const out: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined || value === null)
      continue
    const current = out[key]
    if (isPlainObject(current) && isPlainObject(value))
      out[key] = deepMerge(current, value)
    else
      out[key] = value
  }
  return out as T
}

/**
 * Which note frontmatter keys may override the base:
 *   - `'all'` → note is the source of truth (CodiMD preset route).
 *   - `string[]` → only these top-level keys.
 *   - `[]`/undefined → note contributes its body only, never frontmatter.
 */
export type NoteOverridePolicy = 'all' | readonly string[] | undefined

/** Keep only the whitelisted top-level keys of an override object. */
export function applyOverridePolicy(
  noteFrontmatter: Record<string, unknown>,
  policy: NoteOverridePolicy,
): { filtered: Record<string, unknown>, applied: string[] } {
  if (policy === 'all') {
    const applied = Object.keys(noteFrontmatter).filter(
      k => noteFrontmatter[k] !== undefined && noteFrontmatter[k] !== null,
    )
    return { filtered: { ...noteFrontmatter }, applied }
  }
  if (!policy || policy.length === 0)
    return { filtered: {}, applied: [] }

  const filtered: Record<string, unknown> = {}
  const applied: string[] = []
  for (const key of policy) {
    const value = noteFrontmatter[key]
    if (value !== undefined && value !== null) {
      filtered[key] = value
      applied.push(key)
    }
  }
  return { filtered, applied }
}
