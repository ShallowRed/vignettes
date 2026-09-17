import { assertCanEditDeck } from '../../../../utils/access'
import { useVersionHistory } from '../../../../utils/sources'
import { readVersionId } from '../../../../utils/version-id'

/**
 * One published version of a deck, with its markdown.
 * GET /api/presentations/:slug/versions/:id
 */
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) {
    throw createError({ statusCode: 400, statusMessage: 'Missing slug' })
  }
  await assertCanEditDeck(event, slug)
  const version = await useVersionHistory().load(slug, readVersionId(event))
  if (!version) {
    throw createError({ statusCode: 404, statusMessage: 'Version not found' })
  }
  return version
})
