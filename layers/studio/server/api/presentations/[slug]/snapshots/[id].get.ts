import type { DraftSnapshotDetail } from '#shared/presentations'
import { assertCanEditDeck } from '../../../../utils/access'
import { useSnapshotStore } from '../../../../utils/collab'
import { readVersionId } from '../../../../utils/version-id'

/**
 * One snapshot of the draft, with its markdown.
 * GET /api/presentations/:slug/snapshots/:id
 */
export default defineEventHandler(async (event): Promise<DraftSnapshotDetail> => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) {
    throw createError({ statusCode: 400, statusMessage: 'Missing slug' })
  }
  await assertCanEditDeck(event, slug)
  const snapshot = await useSnapshotStore().load(slug, readVersionId(event))
  if (!snapshot) {
    throw createError({ statusCode: 404, statusMessage: 'Snapshot not found' })
  }
  return { kind: 'snapshot', id: snapshot.id, at: snapshot.createdAt, authors: snapshot.authors, label: snapshot.label, bytes: snapshot.bytes, raw: snapshot.raw }
})
