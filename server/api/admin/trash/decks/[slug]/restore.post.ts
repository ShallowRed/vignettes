import { isPrivileged } from '#shared/access'
import { isDeckSlug } from '#shared/deck'
import { getActorRole } from '../../../../../utils/actor'
import { useDeckMeta } from '../../../../../utils/sources'

/** POST /api/admin/trash/decks/:slug/restore — bring a trashed deck back. */
export default defineEventHandler(async (event) => {
  const role = await getActorRole(event)
  if (!isPrivileged(role)) {
    throw createError({ statusCode: role === 'anonymous' ? 401 : 403, statusMessage: 'Owner or editor role required' })
  }

  const slug = getRouterParam(event, 'slug')
  if (!slug || !isDeckSlug(slug)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid slug' })
  }

  const restored = await useDeckMeta().restore(slug)
  if (!restored) {
    throw createError({ statusCode: 404, statusMessage: `No trashed deck "${slug}"` })
  }
  return { ok: true }
})
