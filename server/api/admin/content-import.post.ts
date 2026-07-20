import { z } from 'zod'
import { assertOwner } from '../../utils/access'
import { runContentImport } from '../../utils/content-import'
import { useDb } from '../../utils/db'

const BodySchema = z.object({ apply: z.boolean().optional() }).strict()

/**
 * POST /api/admin/content-import — import the git content repo into the database
 * (owner only). Dry-run unless `{ apply: true }`, so the plan can always be
 * reviewed first. Idempotent, and decks the database already owns are untouched.
 *
 * This exists so the migration is an explicit, auditable act from the app rather
 * than a shell command against a container — while staying explicit, never
 * automatic: nothing calls it on boot.
 */
export default defineEventHandler(async (event) => {
  await assertOwner(event)

  const parsed = BodySchema.safeParse(await readBody(event).catch(() => ({})))
  if (!parsed.success)
    throw createError({ statusCode: 400, statusMessage: 'Body must be { apply?: boolean }' })

  const { plan, applied } = await runContentImport(useDb(), { apply: parsed.data.apply === true })
  return { applied, plan }
})
