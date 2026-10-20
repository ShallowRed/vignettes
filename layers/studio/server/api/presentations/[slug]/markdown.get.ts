import { assertCanEditDeck, gateDeckAccess, gateOptionsOf } from '../../../utils/access'
import { currentDraftText } from '../../../utils/collab'
import { useDbContent } from '../../../utils/sources'

/**
 * Download the Markdown of a deck, frontmatter included, as `<slug>.md`.
 * GET /api/presentations/:slug/markdown
 *
 * The published version follows the access rules of reading the deck. `?draft`
 * returns the working draft, the live text when a collab room is open, to
 * whoever may edit the deck, and the published text when no draft exists.
 * `GET /:slug` answers JSON with the resolved deck; this route sends the stored
 * text as a file.
 */
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) {
    throw createError({ statusCode: 400, statusMessage: 'Slug parameter is required' })
  }

  let raw: string | null | undefined
  if ('draft' in getQuery(event)) {
    await assertCanEditDeck(event, slug)
    raw = await currentDraftText(slug) ?? (await useDbContent().source.load(slug))?.raw
  }
  else {
    raw = (await useDbContent().source.load(slug))?.raw
    const gate = raw ? await gateOptionsOf(slug) : null
    if (!gate)
      throw createError({ statusCode: 404, statusMessage: 'Not found' })
    await gateDeckAccess(event, gate)
  }
  if (!raw) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  setResponseHeader(event, 'content-type', 'text/markdown; charset=utf-8')
  setResponseHeader(event, 'content-disposition', `attachment; filename="${slug}.md"`)
  return raw
})
