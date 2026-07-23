import { LifecycleSchema, PublicationStatusSchema } from '#shared/access'
import { isDeckSlug } from '#shared/deck'
import { z } from 'zod'
import { getActorRole } from '../../../utils/actor'
import { useDeckMeta } from '../../../utils/sources'

const PatchSchema = z.object({
  title: z.string().min(1).optional(),
  status: PublicationStatusSchema.optional(),
  lifecycle: LifecycleSchema.optional(),
  project: z.string().nullable().optional(),
  theme: z.string().nullable().optional(),
  alias: z.string().min(1).nullable().optional(),
  frozenBundle: z.string().nullable().optional(),
  unlisted: z.boolean().optional(),
}).strict()

/**
 * PATCH /api/admin/decks/:slug — edit a deck's catalog/access metadata. Makes
 * the database row the metadata truth (`managed`), shadowing file frontmatter
 * and the yaml registry entry for this deck.
 */
export default defineEventHandler(async (event) => {
  const role = await getActorRole(event)
  if (role !== 'owner' && role !== 'editor') {
    throw createError({
      statusCode: role === 'anonymous' ? 401 : 403,
      statusMessage: 'Owner or editor role required',
    })
  }

  const slug = getRouterParam(event, 'slug')
  if (!slug || !isDeckSlug(slug)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid slug' })
  }

  // update() upserts (a file-backed deck gains its managed row here), but a
  // trashed deck must stay absent until restored rather than be edited back.
  if (await useDeckMeta().isTrashed(slug)) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const parsed = PatchSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: `Invalid patch: ${parsed.error.issues.map(i => i.path.join('.') || i.message).join(', ')}` })
  }

  // null clears an optional column; undefined leaves it untouched.
  const patch = Object.fromEntries(
    Object.entries(parsed.data).filter(([, v]) => v !== undefined),
  )

  return await useDeckMeta().update(slug, patch)
})
