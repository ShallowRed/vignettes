import { MAX_JSON_BODY_BYTES } from '@vignettes/core/deck'
import { MAX_MEDIA_BYTES } from '@vignettes/core/media'

/** An image at the upload limit, with the multipart framing around it. */
const MAX_UPLOAD_BYTES = MAX_MEDIA_BYTES + 1024 * 1024

const PAYLOAD_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * Refuse a request body above the limit of its route before a handler reads it.
 * h3 1, under Nitro 2, reads a body whole and has no limit: `assertBodySize`
 * comes with h3 2. Node stops reading a body at its `Content-Length`, so the
 * declared length bounds what a handler receives; a chunked body, which
 * declares none, is refused.
 */
export default defineEventHandler((event) => {
  if (!PAYLOAD_METHODS.has(event.method))
    return
  const declared = getRequestHeader(event, 'content-length')
  if (declared === undefined) {
    if (getRequestHeader(event, 'transfer-encoding'))
      throw createError({ statusCode: 411, statusMessage: 'A request body must declare its Content-Length' })
    return
  }
  const limit = event.path.startsWith('/api/media') ? MAX_UPLOAD_BYTES : MAX_JSON_BODY_BYTES
  if (Number(declared) > limit)
    throw createError({ statusCode: 413, statusMessage: `The request body weighs more than the ${limit / 2 ** 20} MB limit` })
})
