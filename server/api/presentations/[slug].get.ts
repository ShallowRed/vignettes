import type { NoteSource } from '#shared/deck'
import { resolveDeckStatus, splitFrontmatter } from '#shared/deck'
import { gateDeckAccess } from '../../utils/access'
import { useDraftStore } from '../../utils/collab'
import { resolveDeckForRoute } from '../../utils/deck-resolution'
import { readPresentationContent } from '../../utils/presentations'
import { useDbContent, useDeckMeta } from '../../utils/sources'

/**
 * Serve a deck by slug: the published database version first, else the committed
 * file. For managed decks the database row is the status/access truth (admin
 * edits win over the served frontmatter); everything else keeps deriving from
 * the markdown itself.
 */
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) {
    throw createError({ statusCode: 400, statusMessage: 'Slug parameter is required' })
  }

  const published = await useDbContent().source.load(slug)
  const result = published
    ? { content: published.raw, status: resolveDeckStatus(published.raw) }
    : await readPresentationContent(slug)
  if (!result) {
    throw createError({ statusCode: 404, statusMessage: `Presentation "${slug}" not found` })
  }

  const meta = await useDeckMeta().get(slug)
  const { content: stub } = result
  const stubMeta = splitFrontmatter(stub).data
  const status = meta?.managed ? meta.status : result.status

  await gateDeckAccess(event, {
    slug,
    status,
    storedHash: meta?.managed
      ? meta.accessPasswordHash
      : stubMeta.accessPassword as string | undefined,
  })

  const { content, editUrl } = await resolveDeckForRoute({
    stub,
    source: stubMeta.source as NoteSource | undefined,
    noteId: stubMeta.noteId as string | undefined,
    noteOverride: [],
  })

  return { content, status, editUrl, writable: useDraftStore().isWritable() }
})
