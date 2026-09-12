import { isDeckSlug } from '@vignettes/core/deck'
/**
 * POST /api/admin/trash/projects/:slug/restore — restore a project and every
 * deck currently trashed under it (the folder comes back whole).
 */
import { assertPrivileged } from '../../../../../utils/access'

import { useProjectStore } from '../../../../../utils/sources'

export default defineEventHandler(async (event) => {
  await assertPrivileged(event)

  const slug = getRouterParam(event, 'slug')
  if (!slug || !isDeckSlug(slug)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid slug' })
  }

  const restored = await useProjectStore().restore(slug)
  if (!restored) {
    throw createError({ statusCode: 404, statusMessage: `No trashed project "${slug}"` })
  }
  return { ok: true }
})
