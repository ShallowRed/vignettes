import { isPrivileged } from '#shared/access'
import { z } from 'zod'
import { getActorRole } from '../../../utils/actor'
import { useProjectStore } from '../../../utils/sources'

const CreateSchema = z.object({
  title: z.string().trim().min(1),
  color: z.string().trim().min(1).nullable().optional(),
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
    throw createError({ statusCode: 400, statusMessage: 'Body must be { title, color? }' })
  }

  const project = await useProjectStore().create({ title: parsed.data.title, color: parsed.data.color ?? null })
  setResponseStatus(event, 201)
  return project
})
