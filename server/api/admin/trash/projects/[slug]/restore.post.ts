import { isPrivileged } from '#shared/access'
import { isDeckSlug } from '#shared/deck'
import { getActorRole } from '../../../../../utils/actor'
import { useProjectStore } from '../../../../../utils/sources'

/**
 * POST /api/admin/trash/projects/:slug/restore — restore a project and every
 * deck currently trashed under it (the folder comes back whole).
 */
export default defineEventHandler(async (event) => {
  const role = await getActorRole(event)
  if (!isPrivileged(role)) {
    throw createError({ statusCode: role === 'anonymous' ? 401 : 403, statusMessage: 'Owner or editor role required' })
  }

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
