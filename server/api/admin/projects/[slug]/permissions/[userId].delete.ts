import { isDeckSlug } from '#shared/deck'
import { assertOwner } from '../../../../../utils/access'
import { useProjectPermissionStore } from '../../../../../utils/sources'

/** DELETE /api/admin/projects/:slug/permissions/:userId — revoke a project grant (owner only). */
export default defineEventHandler(async (event) => {
  await assertOwner(event)

  const slug = getRouterParam(event, 'slug')
  const userId = Number(getRouterParam(event, 'userId'))
  if (!slug || !isDeckSlug(slug) || !Number.isInteger(userId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid project slug or user id' })
  }

  await useProjectPermissionStore().remove(slug, userId)
  return { ok: true }
})
