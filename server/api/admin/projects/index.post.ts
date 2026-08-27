import { isPrivileged } from '#shared/access'
import { isDeckSlug } from '#shared/deck'
import { PROJECT_ICONS } from '#shared/projects'
import { z } from 'zod'
import { getActorRole } from '../../../utils/actor'
import { useProjectStore } from '../../../utils/sources'

const CreateSchema = z.object({
  title: z.string().trim().min(1),
  color: z.string().trim().min(1).nullable().optional(),
  icon: z.enum(PROJECT_ICONS).nullable().optional(),
  /** Optional explicit slug; derived from the title when absent. */
  slug: z.string().optional(),
}).strict()

/**
 * POST /api/admin/projects — create a project (a first-class catalog folder).
 * The slug is derived from the title and disambiguated. Privileged only, like
 * deck creation.
 */
export default defineEventHandler(async (event) => {
  const role = await getActorRole(event)
  if (!isPrivileged(role)) {
    throw createError({
      statusCode: role === 'anonymous' ? 401 : 403,
      statusMessage: 'Owner or editor role required',
    })
  }

  const parsed = CreateSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Body must be { title, color?, slug? }' })
  }

  const store = useProjectStore()
  if (parsed.data.slug !== undefined) {
    if (!isDeckSlug(parsed.data.slug))
      throw createError({ statusCode: 400, statusMessage: 'Invalid slug' })
    if (await store.slugExists(parsed.data.slug))
      throw createError({ statusCode: 409, statusMessage: 'Slug already taken' })
  }

  const project = await store.create({ title: parsed.data.title, color: parsed.data.color ?? null, icon: parsed.data.icon ?? null, slug: parsed.data.slug })
  setResponseStatus(event, 201)
  return project
})
