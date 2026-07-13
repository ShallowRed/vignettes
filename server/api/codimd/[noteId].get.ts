import type { NoteSource } from '#shared/deck'
import { resolveDeck } from '#shared/deck'
import { getEditUrl } from '../../utils/codimd'
import { noteSource } from '../../utils/sources'

/** GET /api/codimd/:noteId?preset=dsfr&source=codimd — serve a note with a preset's frontmatter. */
export default defineEventHandler(async (event) => {
  const noteId = getRouterParam(event, 'noteId')

  if (!noteId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'noteId parameter is required',
    })
  }

  const query = getQuery(event)
  const source: NoteSource = (query.source as NoteSource) || 'codimd'
  const preset = (query.preset as string) || 'dsfr'

  if (source !== 'codimd' && source !== 'hackmd') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid source. Must be "codimd" or "hackmd".',
    })
  }

  const remote = await noteSource(source).load(noteId)

  if (!remote) {
    throw createError({
      statusCode: 502,
      statusMessage: `Could not fetch note "${noteId}" from ${source}`,
    })
  }

  // Note frontmatter is authoritative here: it overrides the preset base.
  const deck = resolveDeck({
    preset,
    remote: remote.raw,
    noteOverride: 'all',
    source,
  })

  return {
    content: deck.content,
    status: 'public' as const,
    editUrl: getEditUrl(source, noteId),
  }
})
