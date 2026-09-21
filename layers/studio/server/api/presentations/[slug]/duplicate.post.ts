import { markdownToYDocUpdate } from '#shared/collab/ydoc'
import { isDeckSlug, splitFrontmatter, stringifyDocument } from '@vignettes/core/deck'
import { z } from 'zod'
import { assertCanCreateInProject, assertCanEditDeck } from '../../../utils/access'
import { currentDraftText, useDraftStore } from '../../../utils/collab'
import { useDbContent, useDeckMeta } from '../../../utils/sources'

const BodySchema = z.object({
  slug: z.string().refine(isDeckSlug, 'Invalid slug'),
  title: z.string().trim().min(1).optional(),
  /** `variant`: a version beside the source (a language, a format); `edition`: the deck that replaces it. */
  mode: z.enum(['variant', 'edition']),
  variantLabel: z.string().trim().min(1).max(40).optional(),
  /** The label the source takes when it had none, so both show on the family card. */
  sourceVariantLabel: z.string().trim().min(1).max(40).optional(),
}).strict()

/**
 * Copy a deck into a new one, as a draft: its published text, or its draft
 * when nothing is published. The copy keeps the folder, the theme and the
 * access of the source. A variant joins the source's family, which the
 * source's title names when it had none; an edition replaces the source.
 * POST /api/presentations/:slug/duplicate   body: { slug, mode, title?, variantLabel?, sourceVariantLabel? }
 */
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) {
    throw createError({ statusCode: 400, statusMessage: 'Missing slug' })
  }
  const parsed = BodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Body must be { slug, mode, title?, variantLabel?, sourceVariantLabel? }' })
  }
  const body = parsed.data

  // The edit right comes first, so a refused caller cannot tell an unknown
  // deck from a private one.
  await assertCanEditDeck(event, slug)
  const meta = useDeckMeta()
  const source = await meta.get(slug)
  if (!source) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  await assertCanCreateInProject(event, source.project)

  const drafts = useDraftStore()
  if (!drafts.isWritable()) {
    throw createError({ statusCode: 503, statusMessage: 'Draft storage is unavailable on this deployment' })
  }
  if (await meta.existsIncludingTrashed(body.slug)) {
    throw createError({ statusCode: 409, statusMessage: `A deck "${body.slug}" already exists (it may be in the trash)` })
  }

  const raw = (await useDbContent().source.load(slug))?.raw ?? await currentDraftText(slug)
  if (!raw) {
    throw createError({ statusCode: 404, statusMessage: 'Nothing to copy' })
  }
  const title = body.title ?? source.title
  // The title lives in the frontmatter too: a publish re-reads it from there.
  const { data, body: text } = splitFrontmatter(raw)
  await drafts.save(body.slug, markdownToYDocUpdate(stringifyDocument({ ...data, title }, text)))

  const family = body.mode === 'variant' ? source.family ?? source.title : source.family
  const created = await meta.update(body.slug, {
    title,
    status: source.status,
    unlisted: source.unlisted,
    accessPasswordHash: source.accessPasswordHash ?? null,
    project: source.project ?? null,
    theme: source.theme ?? null,
    family: family ?? null,
    variantLabel: body.mode === 'variant' ? body.variantLabel ?? null : source.variantLabel ?? null,
  })

  if (body.mode === 'variant' && (!source.family || (!source.variantLabel && body.sourceVariantLabel))) {
    await meta.update(slug, {
      family: family ?? null,
      ...(!source.variantLabel && body.sourceVariantLabel ? { variantLabel: body.sourceVariantLabel } : {}),
    })
  }
  if (body.mode === 'edition')
    await meta.update(slug, { supersededBy: body.slug })

  setResponseStatus(event, 201)
  return created
})
