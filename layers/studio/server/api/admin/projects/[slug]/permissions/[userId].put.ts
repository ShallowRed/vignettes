import { GrantBodySchema } from '#shared/access'
import { isDeckSlug } from '@vignettes/core/deck'
import { assertOwner } from '../../../../../utils/access'
import { useProjectPermissionStore } from '../../../../../utils/sources'
import { useUserStore } from '../../../../../utils/users'

/**
 * PUT /api/admin/projects/:slug/permissions/:userId — grant editor/viewer on a
 * whole project (owner only). A viewer grant lets the user see every deck in the
 * project (private ones included); an editor grant lets them edit them all.
 */
export default defineEventHandler(async (event) => {
  const owner = await assertOwner(event)

  const slug = getRouterParam(event, 'slug')
  const userId = Number(getRouterParam(event, 'userId'))
  if (!slug || !isDeckSlug(slug) || !Number.isInteger(userId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid project slug or user id' })
  }

  const parsed = GrantBodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Body must be { role: editor | viewer }' })
  }

  if (await useUserStore().getAccount(userId) == null) {
    throw createError({ statusCode: 404, statusMessage: 'Unknown user' })
  }

  await useProjectPermissionStore().set(slug, userId, parsed.data.role, owner.login ?? 'unknown', parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null)
  return { ok: true, project: slug, userId, role: parsed.data.role }
})
