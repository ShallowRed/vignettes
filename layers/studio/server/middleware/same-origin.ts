import { contentTokenActor } from '../utils/content-token'
import { crossOriginRefusal } from '../utils/same-origin'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Refuse a request that changes state when it comes from a page of another
 * origin. The session cookie is `SameSite=Lax`, which a page of a sibling
 * subdomain still receives. The upgrade of `/collab` makes the same check in its
 * own handler. The content scripts send the content token in `Authorization`:
 * a page of another site can add that header only through a CORS preflight,
 * which this server never answers.
 */
export default defineEventHandler((event) => {
  if (SAFE_METHODS.has(event.method))
    return
  if (contentTokenActor(event))
    return
  const headers = { get: (name: string) => getRequestHeader(event, name) }
  const refusal = crossOriginRefusal(headers, getRequestURL(event).origin)
  if (refusal)
    throw createError({ statusCode: 403, statusMessage: `Cross-origin request refused: ${refusal}` })
})
