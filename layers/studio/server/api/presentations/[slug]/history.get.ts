import type { HistoryEntry } from '#shared/presentations'
import { compareHistoryEntries } from '#shared/presentations'
import { assertCanEditDeck } from '../../../utils/access'
import { useSnapshotStore } from '../../../utils/collab'
import { useVersionHistory } from '../../../utils/sources'

/**
 * The history of a deck: its published versions and the snapshots of its
 * draft, newest first.
 * GET /api/presentations/:slug/history
 *
 * Former texts may hold what the deck no longer shows, so the history is read
 * with the edit right, like the draft.
 */
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) {
    throw createError({ statusCode: 400, statusMessage: 'Missing slug' })
  }
  await assertCanEditDeck(event, slug)
  const [versions, snapshots] = await Promise.all([useVersionHistory().list(slug), useSnapshotStore().list(slug)])
  const entries: HistoryEntry[] = [
    ...versions.map(v => ({ kind: 'version' as const, id: v.id, at: v.publishedAt, publishedBy: v.publishedBy, bytes: v.bytes, current: v.current })),
    ...snapshots.map(s => ({ kind: 'snapshot' as const, id: s.id, at: s.createdAt, authors: s.authors, label: s.label, bytes: s.bytes })),
  ]
  entries.sort(compareHistoryEntries)
  return { entries }
})
