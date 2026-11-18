import type { H3Event } from 'h3'
import { getResponseHeader, removeResponseHeader } from 'h3'

/**
 * Removes every cookie from a response that a shared cache may keep
 * (`Cache-Control: public`), since the cache would give the cookie to other
 * visitors. The routes that serve files decide the cache, and a cookie may come
 * from any reader of the session: the reseal of a session, the clearing of an
 * ended one, or the empty session that nuxt-auth-utils opens on each request.
 * A cached handler of Nitro may return its body after sending the response
 * itself, and a sent response keeps its headers.
 */
export function dropCookiesOfPublicResponse(event: H3Event): void {
  if (event.node.res.headersSent)
    return
  const cacheControl = getResponseHeader(event, 'cache-control')
  if (typeof cacheControl === 'string' && cacheControl.trimStart().toLowerCase().startsWith('public'))
    removeResponseHeader(event, 'set-cookie')
}
