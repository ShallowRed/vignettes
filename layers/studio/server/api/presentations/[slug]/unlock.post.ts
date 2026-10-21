import { gateOptionsOf, unlockDeck } from '../../../utils/access'
import { publishedSource } from '../../../utils/sources'

/**
 * POST /api/presentations/:slug/unlock: the password of a semi-private deck, in
 * the body `{ password }`. A deck without a published version answers 404, as
 * `GET /api/presentations/:slug` does.
 */
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  const gate = slug && await publishedSource.load(slug) ? await gateOptionsOf(slug) : null
  if (!gate)
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  return await unlockDeck(event, gate)
})
