// A placeholder origin: a value that resolves outside it names another site.
const BASE = 'https://studio.invalid'

/**
 * The path of this instance a value names, as the browser resolves it, or the
 * fallback. A browser reads `/\host` and `//host` as another site, and drops
 * tabs and line breaks before it resolves an address: the value is resolved the
 * same way and kept only when it stays on the origin. A dot segment can leave a
 * resolved path that starts with `//`, such as `/..//host`, which names another
 * site once written in `Location`: that path is refused too.
 */
export function safeRedirectPath(value: unknown, fallback = '/'): string {
  if (typeof value !== 'string' || !value.startsWith('/'))
    return fallback
  let url: URL
  try {
    url = new URL(value, BASE)
  }
  catch {
    return fallback
  }
  return url.origin === BASE && !url.pathname.startsWith('//') ? `${url.pathname}${url.search}${url.hash}` : fallback
}

export function loginHref(path: string): string {
  return `/login?redirect=${encodeURIComponent(path)}`
}
