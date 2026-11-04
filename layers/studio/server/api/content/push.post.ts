import { LifecycleSchema } from '#shared/access'
import { DeckSlugSchema } from '#shared/presentations'
import { z } from 'zod'
import { assertContentScript } from '../../utils/access'
import { actorLabel } from '../../utils/actor'
import { announcePublication, followPublication } from '../../utils/collab'
import { pushStubs } from '../../utils/content-push'
import { useContentArchive, useProjectStore } from '../../utils/sources'

const BodySchema = z.object({
  stubs: z.array(z.object({
    slug: DeckSlugSchema,
    raw: z.string().min(1),
    registry: z.object({ alias: DeckSlugSchema, lifecycle: LifecycleSchema, frozenBundle: DeckSlugSchema.nullable() }).nullable(),
    unlisted: z.boolean(),
  })).min(1),
  apply: z.boolean(),
  folder: z.string().min(1).optional(),
})

/** POST /api/content/push, for `content:push`: publish stubs of the content space, or plan it. */
export default defineEventHandler(async (event) => {
  const actor = await assertContentScript(event)
  const parsed = BodySchema.safeParse(await readBody(event))
  if (!parsed.success)
    throw createError({ statusCode: 400, statusMessage: `Invalid push: ${parsed.error.issues.map(i => i.path.join('.') || i.message).join(', ')}` })
  const { stubs, apply, folder } = parsed.data
  if (folder && !await useProjectStore().isLive(folder))
    throw createError({ statusCode: 400, statusMessage: `No folder "${folder}"` })
  try {
    const { results, republished } = await pushStubs(useContentArchive(), stubs, { apply, folder })
    const written = results.filter(r => r.action === 'create' || r.action === 'republish')
    if (apply && written.length)
      console.info(`[content] ${actorLabel(actor)} pushed ${written.map(r => `${r.slug} (${r.action})`).join(', ')}`)
    // The versions are written: a failed follow names its deck and the others go on.
    for (const { slug, previous, raw } of republished) {
      const result = results.find(r => r.slug === slug)!
      result.draft = await followPublication(slug, previous, raw, { apply }).catch((error: Error) => {
        console.warn(`[content] the draft of "${slug}" did not follow the pushed version: ${error.message}`)
        return 'failed' as const
      })
      if (apply)
        announcePublication(slug)
    }
    return results
  }
  catch (error) {
    throw createError({ statusCode: 400, statusMessage: (error as Error).message })
  }
})
