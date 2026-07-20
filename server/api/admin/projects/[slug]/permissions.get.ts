import { isDeckSlug } from '#shared/deck'
import { assertOwner } from '../../../../utils/access'
import { useProjectPermissionStore } from '../../../../utils/sources'

/** GET /api/admin/projects/:slug/permissions — grants on a project (owner only). */
export default defineEventHandler(async (event) => {
  await assertOwner(event)

  const slug = getRouterParam(event, 'slug')
  if (!slug || !isDeckSlug(slug)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid project slug' })
  }

  return await useProjectPermissionStore().listForProject(slug)
})
