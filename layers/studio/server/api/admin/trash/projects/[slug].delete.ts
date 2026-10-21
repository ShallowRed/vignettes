import { isDeckSlug } from '@vignettes/core/deck'
import { assertOwner } from '../../../../utils/access'
import { useCollabServer } from '../../../../utils/collab'
import { useProjectStore } from '../../../../utils/sources'

/**
 * DELETE /api/admin/trash/projects/:slug — permanently erase a trashed project
 * and every deck it holds. Owner only, irreversible. Refused while any of its
 * decks has an open collab session.
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

  const purged = await store.purge(slug)
  if (!purged) {
    throw createError({ statusCode: 404, statusMessage: `No folder "${slug}"` })
  }
  return { ok: true }
})
