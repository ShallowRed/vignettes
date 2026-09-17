import { assertCanEditDeck } from '../../../utils/access'
import { useVersionHistory } from '../../../utils/sources'

/**
 * The published versions of a deck, newest first.
 * GET /api/presentations/:slug/versions
 *
 * Former versions may hold text the deck no longer shows, so the history is
 * read with the edit right, like the draft.
 */
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) {
    throw createError({ statusCode: 400, statusMessage: 'Missing slug' })
  }
  await assertCanEditDeck(event, slug)
  return { versions: await useVersionHistory().list(slug) }
})
