import { z } from 'zod'
import { assertOwner } from '../../utils/access'
import { runNoteSnapshot } from '../../utils/note-snapshot'

const BodySchema = z.object({ apply: z.boolean().optional() }).strict()

/**
 * POST /api/admin/note-snapshot — freeze the collaborative notes into published
 * versions (owner only). Dry-run unless `{ apply: true }`.
 *
 * Same rationale as `content-import`: a migration that touches production
 * content is an explicit, reviewable act from the app, never a shell command
 * against a container and never something that runs on boot. Removed once the
 * cutover is done.
 */
export default defineEventHandler(async (event) => {
  await assertOwner(event)

  const parsed = BodySchema.safeParse(await readBody(event).catch(() => ({})))
  if (!parsed.success)
    throw createError({ statusCode: 400, statusMessage: 'Body must be { apply?: boolean }' })

  const { plan, applied } = await runNoteSnapshot({ apply: parsed.data.apply === true })
  return { applied, plan }
})
