import { z } from 'zod'
import { assertCanEditDeck } from '../../../utils/access'
import { currentDraftText, recordDraftSnapshot, useDraftStore } from '../../../utils/collab'

const BodySchema = z.object({ label: z.string().trim().min(1).max(80).optional() })

/**
 * Keep the draft as it is now, with a label. A labelled snapshot is never pruned.
 * POST /api/presentations/:slug/snapshots   body: { label? }
 */
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) {
    throw createError({ statusCode: 400, statusMessage: 'Missing slug' })
  }
  const editor = await assertCanEditDeck(event, slug)
  if (!useDraftStore().isWritable()) {
    throw createError({ statusCode: 503, statusMessage: 'Draft storage is unavailable on this deployment' })
  }
  const body = BodySchema.safeParse(await readBody(event))
  if (!body.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid body' })
  }
  const raw = await currentDraftText(slug)
  if (raw === null) {
    throw createError({ statusCode: 404, statusMessage: 'No draft to keep' })
  }
  const id = await recordDraftSnapshot(slug, raw, { by: editor.login, force: true, label: body.data.label ?? null })
  return { ok: true, id }
})
