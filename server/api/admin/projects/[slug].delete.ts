import { isDeckSlug } from '@vignettes/core/deck'
import { assertOwner } from '../../../utils/access'
import { useCollabServer } from '../../../utils/collab'
import { useProjectStore } from '../../../utils/sources'

/**
 * DELETE /api/admin/projects/:slug — move the project AND its decks to the trash
 * (soft cascade, reversible). Owner only, and refused while any deck in the
 * project has an open collab session.
 */
export default defineEventHandler(async (event) => {
  await assertOwner(event)

  const slug = getRouterParam(event, 'slug')
  if (!slug || !isDeckSlug(slug)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid slug' })
  }

  const store = useProjectStore()
  const collab = useCollabServer()
  const openDeck = (await store.liveDeckSlugs(slug)).find(deckSlug => collab.documents.has(deckSlug))
  if (openDeck) {
    throw createError({ statusCode: 409, statusMessage: `A collab session is open on "${openDeck}"; close it first` })
  }

  const trashed = await store.softDelete(slug)
  if (!trashed) {
    throw createError({ statusCode: 404, statusMessage: `No project "${slug}"` })
  }
  return { ok: true }
})
