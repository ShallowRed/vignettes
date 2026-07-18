/**
 * Save a deck's markdown.
 * PUT /api/presentations/:slug   body: { raw }
 *
 * The write side of `GET /api/presentations/:slug`. Owner/editor only; persists
 * through the `fileWriter` `ContentWriter` so the markdown stays the source of
 * truth (`resolveDeck` keeps reading exactly what the editor wrote). Path safety
 * (no traversal, non-empty) is enforced by `prepareDeckWrite` inside the writer;
 * status lives in the frontmatter, not the path.
 */

import { isPrivileged } from '#shared/access'
import { getActorRole } from '../../utils/actor'
import { fileWriter } from '../../utils/sources'

export default defineEventHandler(async (event) => {
  if (!isPrivileged(await getActorRole(event))) {
    throw createError({ statusCode: 403, statusMessage: 'Owner or editor role required' })
  }

  const slug = getRouterParam(event, 'slug')
  if (!slug) {
    throw createError({ statusCode: 400, statusMessage: 'Missing slug' })
  }

  const body = await readBody(event)
  const raw = body?.raw

  if (typeof raw !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Body must be { raw: string }',
    })
  }

  try {
    const result = await fileWriter.save({ slug, raw })
    return { ok: true, ...result }
  }
  catch (error: any) {
    // prepareDeckWrite throws on invalid input (bad slug, empty body) —
    // surface as 400; storage failures (read-only deploy) bubble as 500.
    const message = error?.message || 'Failed to save deck'
    const isValidation = /invalid|empty markdown/i.test(message)
    throw createError({
      statusCode: isValidation ? 400 : 500,
      statusMessage: message,
    })
  }
})
