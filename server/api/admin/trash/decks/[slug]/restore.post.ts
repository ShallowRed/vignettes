import { isDeckSlug } from '#shared/deck'
/** POST /api/admin/trash/decks/:slug/restore — bring a trashed deck back. */
import { assertPrivileged } from '../../../../../utils/access'

import { useDeckMeta } from '../../../../../utils/sources'

export default defineEventHandler(async (event) => {
  await assertPrivileged(event)

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
