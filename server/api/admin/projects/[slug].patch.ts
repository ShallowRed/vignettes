import { isDeckSlug } from '#shared/deck'
import { PROJECT_ICONS } from '#shared/projects'
import { z } from 'zod'
/**
 * PATCH /api/admin/projects/:slug — rename, recolor, reorder, or change the slug
 * of a project. Privileged only. Changing the slug cascades to the project's
 * decks and grants (simple cascade: old `/projects/<slug>` links stop resolving).
 */
import { assertPrivileged } from '../../../utils/access'

import { useProjectStore } from '../../../utils/sources'

const PatchSchema = z.object({
  slug: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).optional(),
  color: z.string().trim().min(1).nullable().optional(),
  icon: z.enum(PROJECT_ICONS).nullable().optional(),
  order: z.number().int().optional(),
}).strict()

export default defineEventHandler(async (event) => {
  await assertPrivileged(event)

  const slug = getRouterParam(event, 'slug')
  if (!slug || !isDeckSlug(slug)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid slug' })
  }

  const parsed = PatchSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Body must be { slug?, title?, color?, order? }' })
  }

  const store = useProjectStore()
  const { slug: nextSlug, ...meta } = parsed.data

  // A slug change cascades first, then the other fields apply on the new key.
  let targetSlug = slug
  if (nextSlug && nextSlug !== slug) {
    if (!isDeckSlug(nextSlug)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid slug (letters, digits, dashes, underscores)' })
    }
    if (await store.slugExists(nextSlug)) {
      throw createError({ statusCode: 409, statusMessage: `A project "${nextSlug}" already exists` })
    }
    const renamed = await store.rename(slug, nextSlug)
    if (!renamed) {
      throw createError({ statusCode: 404, statusMessage: `No project "${slug}"` })
    }
    targetSlug = nextSlug
  }

  const project = await store.update(targetSlug, meta)
  if (!project) {
    throw createError({ statusCode: 404, statusMessage: `No project "${targetSlug}"` })
  }
  return project
})
