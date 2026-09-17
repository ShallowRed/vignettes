import { assertCanEditDeck } from '../../../../../utils/access'
import { replaceDraft, useDraftStore } from '../../../../../utils/collab'
import { useVersionHistory } from '../../../../../utils/sources'
import { readVersionId } from '../../../../../utils/version-id'

/**
 * Restore a version: its markdown becomes the draft, which the editors review
 * and publish again. The visitors keep seeing the current version until then.
 * POST /api/presentations/:slug/versions/:id/restore
 */
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) {
    throw createError({ statusCode: 400, statusMessage: 'Missing slug' })
  }
  await assertCanEditDeck(event, slug)
  if (!useDraftStore().isWritable()) {
    throw createError({ statusCode: 503, statusMessage: 'Draft storage is unavailable on this deployment' })
  }
  const version = await useVersionHistory().load(slug, readVersionId(event))
  if (!version) {
    throw createError({ statusCode: 404, statusMessage: 'Version not found' })
  }
  await replaceDraft(slug, version.raw)
  return { ok: true, stamp: await useDraftStore().stamp(slug) }
})
