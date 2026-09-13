import { LifecycleSchema, PublicationStatusSchema } from '#shared/access'
import { isDeckSlug } from '@vignettes/core/deck'
import { z } from 'zod'
import { getActorRole } from '../../../utils/actor'
import { hashAccessPassword } from '../../../utils/password'
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
  family: z.string().trim().min(1).max(120).nullable().optional(),
  variantLabel: z.string().trim().min(1).max(40).nullable().optional(),
  supersededBy: z.string().refine(isDeckSlug, 'Invalid slug').nullable().optional(),
  // Plain password, hashed server-side (null clears it). The UI sets it next to
  // the semi-private status so the two can no longer drift apart.
  accessPassword: z.string().min(8).max(200).nullable().optional(),
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

  if (parsed.data.supersededBy === slug)
    throw createError({ statusCode: 400, statusMessage: 'A deck cannot replace itself' })

  // null clears an optional column; undefined leaves it untouched.
  const { accessPassword, ...rest } = parsed.data
  const patch: Record<string, unknown> = Object.fromEntries(
    Object.entries(rest).filter(([, v]) => v !== undefined),
  )
  if (accessPassword !== undefined)
    patch.accessPasswordHash = accessPassword === null ? null : await hashAccessPassword(accessPassword)

  return await useDeckMeta().update(slug, patch)
})
