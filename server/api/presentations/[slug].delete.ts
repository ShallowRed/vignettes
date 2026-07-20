import { isDeckSlug } from '#shared/deck'
import { assertOwner } from '../../utils/access'
import { useCollabServer } from '../../utils/collab'
import { useDeckMeta } from '../../utils/sources'

/**
 * DELETE /api/presentations/:slug — erase the deck's database state (draft,
 * versions, grants, aliases, row). The database is the source of truth, so this
 * is permanent. Owner only: versions are history and this destroys them.
 */
export default defineEventHandler(async (event) => {
  await assertOwner(event)

  const slug = getRouterParam(event, 'slug')
  if (!slug || !isDeckSlug(slug)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid slug' })
  }

  if (useCollabServer().documents.has(slug)) {
    throw createError({ statusCode: 409, statusMessage: 'A collab session is open for this deck; close it first' })
  }

  const removed = await useDeckMeta().remove(slug)
  if (!removed) {
    throw createError({ statusCode: 404, statusMessage: `No database state for "${slug}" (file decks are managed in git)` })
  }

  return { ok: true }
})
