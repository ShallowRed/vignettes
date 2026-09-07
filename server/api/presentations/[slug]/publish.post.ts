import { yDocUpdateToMarkdown } from '#shared/deck/ydoc'
import { assertCanEditDeck } from '../../../utils/access'
import { useCollabServer, useDraftStore } from '../../../utils/collab'
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

  // Prefer the live room over the stored draft (the store lags by the debounce).
  const live = useCollabServer().documents.get(slug)
  const draft = live
    ? yDocUpdateToMarkdown(await import('yjs').then(Y => Y.encodeStateAsUpdate(live)))
    : await useDraftStore().load(slug).then(update => update && yDocUpdateToMarkdown(update))

  if (!draft) {
    throw createError({ statusCode: 404, statusMessage: 'No draft to publish' })
  }

  try {
    const result = await useDbContent().writer.save({ slug, raw: draft, actor: editor.login ?? 'unknown' })
    // Everyone in the room re-reads the published state (their header would
    // otherwise keep the publication state they loaded).
    live?.broadcastStateless(JSON.stringify({ type: 'published', at: Date.now() }))
    return { ok: true, ...result }
  }
  catch (error: any) {
    const message = error?.message || 'Failed to publish deck'
    const isValidation = /invalid|empty markdown/i.test(message)
    throw createError({ statusCode: isValidation ? 400 : 500, statusMessage: message })
  }
})
