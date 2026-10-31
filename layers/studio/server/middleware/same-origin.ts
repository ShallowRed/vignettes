import { contentTokenActor } from '../utils/content-token'
import { requestOrigin } from '../utils/deck-origin'
import { authenticatePersonalToken } from '../utils/personal-token'
import { crossOriginRefusal } from '../utils/same-origin'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

// The types an HTML form sends. The routes of `/api` read JSON, and the image
// upload a multipart body.
const FORM_TYPE_RE = /^\s*(?:application\/x-www-form-urlencoded|multipart\/form-data|text\/plain)/i

/**
 * Refuse a request that changes state when it comes from a page of another
 * origin. The session cookie is `SameSite=Lax`, which a page of a sibling
 * subdomain still receives. The upgrade of `/collab` makes the same check in its
 * own handler. The content scripts send the content token in `Authorization`,
 * and the command line a personal token: a page of another site can add that
 * header only through a CORS preflight, which this server never answers.
 *
 * A route of `/api` also refuses the body of a form, which a page of this
 * origin could send with the session cookie.
 */
export default defineEventHandler(async (event) => {
  if (SAFE_METHODS.has(event.method))
    return
  if (contentTokenActor(event) || await authenticatePersonalToken(event))
    return
  const headers = { get: (name: string) => getRequestHeader(event, name) }
  const refusal = crossOriginRefusal(headers, requestOrigin(event))
  if (refusal)
    throw createError({ statusCode: 403, statusMessage: `Cross-origin request refused: ${refusal}` })
  const type = getRequestHeader(event, 'content-type')
  if (event.path.startsWith('/api/') && !event.path.startsWith('/api/media') && type && FORM_TYPE_RE.test(type))
    throw createError({ statusCode: 415, statusMessage: 'The routes of /api read a JSON body' })
})
