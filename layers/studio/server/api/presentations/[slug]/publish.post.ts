import { DeckWriteError } from '@vignettes/core/deck'
import { assertCanEditDeck } from '../../../utils/access'
import { currentDraftText, useCollabServer } from '../../../utils/collab'
import { useDbContent } from '../../../utils/sources'

/**
 * Publish a deck: derive the markdown from its draft and persist it as a new
 * immutable version (the explicit act separating "saved" from "visible").
 * POST /api/presentations/:slug/publish
 */
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) {
    throw createError({ statusCode: 400, statusMessage: 'Missing slug' })
  }

  const editor = await assertCanEditDeck(event, slug, { contentToken: true })

  const draft = await currentDraftText(slug)

  if (!draft) {
    throw createError({ statusCode: 404, statusMessage: 'No draft to publish' })
  }

  try {
    const result = await useDbContent().writer.save({ slug, raw: draft, actor: editor.login ?? 'unknown' })
    // Everyone in the room re-reads the published state (their header would
    // otherwise keep the publication state they loaded).
    useCollabServer().documents.get(slug)?.broadcastStateless(JSON.stringify({ type: 'published', at: Date.now() }))
    return { ok: true, ...result }
  }
  catch (error) {
    if (error instanceof DeckWriteError)
      throw createError({ statusCode: 400, statusMessage: error.message })
    throw error
  }
})
