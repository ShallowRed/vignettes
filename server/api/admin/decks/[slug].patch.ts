import { LifecycleSchema, PublicationStatusSchema } from '#shared/access'
import { isDeckSlug, splitFrontmatter } from '#shared/deck'
import { z } from 'zod'
import { getActorRole } from '../../../utils/actor'
import { readPresentationContent } from '../../../utils/presentations'
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

  const parsed = PatchSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: `Invalid patch: ${parsed.error.issues.map(i => i.path.join('.') || i.message).join(', ')}` })
  }

  // null clears an optional column; undefined leaves it untouched.
  const patch = Object.fromEntries(
    Object.entries(parsed.data).filter(([, v]) => v !== undefined),
  )

  // First materialization of a file-backed deck: `update()` upserts, so any
  // column the patch omits would fall back to its DB default (e.g. a public deck
  // silently flipping to private). Seed the base from the file's effective
  // frontmatter so a partial patch only changes what it names.
  const meta = useDeckMeta()
  let base: Record<string, unknown> = {}
  if (!(await meta.get(slug))) {
    const file = await readPresentationContent(slug).catch(() => null)
    if (file) {
      const data = splitFrontmatter(file.content).data as Record<string, unknown>
      base = {
        title: (data.title as string) || slug,
        status: file.status,
        project: (data.project as string) || null,
        theme: (data.theme as string) || null,
        unlisted: Boolean(data.unlisted),
      }
    }
  }

  return await meta.update(slug, { ...base, ...patch })
})
