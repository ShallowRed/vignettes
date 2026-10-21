import { z } from 'zod'
import { assertContentScript } from '../../utils/access'
import { actorLabel } from '../../utils/actor'
import { useContentRewrites } from '../../utils/sources'
import { themeRenameChanges, themeRenameSummary } from '../../utils/theme-rename'

const BodySchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  decks: z.array(z.string()).optional(),
  apply: z.boolean(),
})

/**
 * POST /api/content/theme-rename, for `theme:rename`: rename the theme the decks
 * declare, in one transaction, or with `apply` false say which decks it would
 * rewrite.
 */
export default defineEventHandler(async (event) => {
  const actor = await assertContentScript(event)
  const parsed = BodySchema.safeParse(await readBody(event))
  if (!parsed.success)
    throw createError({ statusCode: 400, statusMessage: `Invalid rename: ${parsed.error.issues.map(i => i.path.join('.') || i.message).join(', ')}` })
  const { from, to, decks, apply } = parsed.data
  const rewrites = useContentRewrites()
  const change = (content: Parameters<typeof themeRenameChanges>[0]) => themeRenameChanges(content, from, to, decks)
  const rename = apply ? await rewrites.rewrite(change, { at: new Date() }) : change(await rewrites.read())
  const summary = themeRenameSummary(rename)
  if (apply && summary.length)
    console.info(`[content] ${actorLabel(actor)} renamed the theme ${from} to ${to} in ${summary.map(deck => deck.slug).join(', ')}`)
  return summary
})
