import { DeckGrantSchema } from '#shared/access'
import { isDeckSlug } from '#shared/deck'
import { z } from 'zod'
import { assertOwner } from '../../../../../utils/access'
import { usePermissionStore } from '../../../../../utils/sources'
import { useUserStore } from '../../../../../utils/users'

const BodySchema = z.object({ role: DeckGrantSchema }).strict()

/** PUT /api/admin/decks/:slug/permissions/:userId — grant editor/viewer on a deck (owner only). */
export default defineEventHandler(async (event) => {
  const owner = await assertOwner(event)

  const slug = getRouterParam(event, 'slug')
  const userId = Number(getRouterParam(event, 'userId'))
  if (!slug || !isDeckSlug(slug) || !Number.isInteger(userId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid slug or user id' })
  }

  const parsed = BodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Body must be { role: editor | viewer }' })
  }

  if (await useUserStore().getRole(userId) == null) {
    throw createError({ statusCode: 404, statusMessage: 'Unknown user' })
  }

  await usePermissionStore().set(slug, userId, parsed.data.role, owner.login ?? 'unknown')
  return { ok: true, slug, userId, role: parsed.data.role }
})
