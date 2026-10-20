import { LifecycleSchema } from '#shared/access'
import { isDeckSlug } from '@vignettes/core/deck'
import { z } from 'zod'
import { assertContentScript } from '../../utils/access'
import { pushStubs } from '../../utils/content-push'
import { useContentArchive } from '../../utils/sources'

const BodySchema = z.object({
  stubs: z.array(z.object({
    slug: z.string().refine(isDeckSlug, 'Invalid slug'),
    raw: z.string().min(1),
    registry: z.object({ alias: z.string().min(1), lifecycle: LifecycleSchema, frozenBundle: z.string().nullable() }).nullable(),
    unlisted: z.boolean(),
  })).min(1),
  apply: z.boolean(),
})

/** POST /api/content/push, for `content:push`: publish stubs of the content space, or plan it. */
export default defineEventHandler(async (event) => {
  const actor = await assertContentScript(event)
  const parsed = BodySchema.safeParse(await readBody(event))
  if (!parsed.success)
    throw createError({ statusCode: 400, statusMessage: `Invalid push: ${parsed.error.issues.map(i => i.path.join('.') || i.message).join(', ')}` })
  try {
    const results = await pushStubs(useContentArchive(), parsed.data.stubs, { apply: parsed.data.apply })
    const written = results.filter(r => r.action === 'create' || r.action === 'republish')
    if (parsed.data.apply && written.length)
      console.info(`[content] ${actor.login} pushed ${written.map(r => `${r.slug} (${r.action})`).join(', ')}`)
    return results
  }
  catch (error) {
    throw createError({ statusCode: 400, statusMessage: (error as Error).message })
  }
})
