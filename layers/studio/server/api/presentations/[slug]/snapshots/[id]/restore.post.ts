import { assertCanEditDeck } from '../../../../../utils/access'
import { replaceDraft, useDraftStore, useSnapshotStore } from '../../../../../utils/collab'
import { readVersionId } from '../../../../../utils/version-id'

/**
 * Restore a snapshot: its markdown becomes the draft again. The replaced draft
 * stays in the history as a snapshot.
 * POST /api/presentations/:slug/snapshots/:id/restore
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
  const snapshot = await useSnapshotStore().load(slug, readVersionId(event))
  if (!snapshot) {
    throw createError({ statusCode: 404, statusMessage: 'Snapshot not found' })
  }
  await replaceDraft(slug, snapshot.raw, editor.login)
  return { ok: true, stamp: await useDraftStore().stamp(slug) }
})
