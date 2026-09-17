import { useSnapshotStore } from '../../../../../utils/collab'
import { restoreIntoDraft } from '../../../../../utils/restore'

/**
 * Restore a snapshot of the draft.
 * POST /api/presentations/:slug/snapshots/:id/restore
 */
export default defineEventHandler(event => restoreIntoDraft(event, { name: 'Snapshot', load: useSnapshotStore().load }))
