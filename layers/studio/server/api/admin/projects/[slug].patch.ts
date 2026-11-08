import { ProjectPatchSchema } from '#shared/projects'
import { isDeckSlug } from '@vignettes/core/deck'
/**
 * PATCH /api/admin/projects/:slug — rename, recolor, reorder, or change the slug
 * of a project. Privileged only. Changing the slug cascades to the project's
 * decks and grants (simple cascade: old `/projects/<slug>` links stop resolving).
 */
import { isReservedProjectSlug } from '../../../db/slugs'
import { assertPrivileged } from '../../../utils/access'

import { useProjectStore } from '../../../utils/sources'

export default defineEventHandler(async (event) => {
  await assertPrivileged(event)

  const slug = getRouterParam(event, 'slug')
  if (!slug || !isDeckSlug(slug)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid slug' })
  }

  const parsed = ProjectPatchSchema.safeParse(await readBody(event))
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
    if (isReservedProjectSlug(nextSlug) || await store.slugExists(nextSlug)) {
      throw createError({ statusCode: 409, statusMessage: `Slug "${nextSlug}" is not available` })
    }
    const renamed = await store.rename(slug, nextSlug)
    if (!renamed) {
      throw createError({ statusCode: 404, statusMessage: `No folder "${slug}"` })
    }
    targetSlug = nextSlug
  }

  const project = await store.update(targetSlug, meta)
  if (!project) {
    throw createError({ statusCode: 404, statusMessage: `No folder "${targetSlug}"` })
  }
  return project
})
