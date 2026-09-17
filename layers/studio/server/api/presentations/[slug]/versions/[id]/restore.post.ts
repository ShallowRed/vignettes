import { restoreIntoDraft } from '../../../../../utils/restore'
import { useVersionHistory } from '../../../../../utils/sources'

/**
 * Restore a published version into the draft.
 * POST /api/presentations/:slug/versions/:id/restore
 */
export default defineEventHandler(event => restoreIntoDraft(event, { name: 'Version', load: useVersionHistory().load }))
