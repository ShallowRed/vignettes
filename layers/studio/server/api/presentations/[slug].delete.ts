import { isDeckSlug } from '@vignettes/core/deck'
import { assertPrivileged } from '../../utils/access'
import { hasRoom } from '../../utils/collab'
import { useDeckMeta } from '../../utils/sources'

/**
 * DELETE /api/presentations/:slug — move the deck to the trash (soft-delete).
 * Reversible from the trash; the permanent erase is the trash purge endpoint.
 * Owner or editor role, as the restore from the trash, and refused while a
 * collab session is open on the deck.
 */
export default defineEventHandler(async (event) => {
  await assertPrivileged(event)

  const slug = getRouterParam(event, 'slug')
  if (!slug || !isDeckSlug(slug)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid slug' })
  }

  if (hasRoom(slug)) {
    throw createError({ statusCode: 409, statusMessage: 'A collab session is open for this deck; close it first' })
  }

  const trashed = await useDeckMeta().softDelete(slug)
  if (!trashed) {
    throw createError({ statusCode: 404, statusMessage: `No database state for "${slug}" (file decks are managed in git)` })
  }

  return { ok: true }
})
