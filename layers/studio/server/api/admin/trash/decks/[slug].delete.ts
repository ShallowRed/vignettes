import { isDeckSlug } from '@vignettes/core/deck'
import { assertOwner } from '../../../../utils/access'
import { hasRoom } from '../../../../utils/collab'
import { useDeckMeta } from '../../../../utils/sources'

/**
 * DELETE /api/admin/trash/decks/:slug — permanently erase a trashed deck
 * (grants, aliases, draft, versions, row). Owner only, irreversible.
 */
export default defineEventHandler(async (event) => {
  await assertOwner(event)

  const slug = getRouterParam(event, 'slug')
  if (!slug || !isDeckSlug(slug)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid slug' })
  }

  if (hasRoom(slug)) {
    throw createError({ statusCode: 409, statusMessage: 'A collab session is open for this deck; close it first' })
  }

  const purged = await useDeckMeta().purge(slug)
  if (!purged) {
    throw createError({ statusCode: 404, statusMessage: `No database state for "${slug}"` })
  }
  return { ok: true }
})
