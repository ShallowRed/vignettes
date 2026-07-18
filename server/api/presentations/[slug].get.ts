import type { NoteSource } from '#shared/deck'
import { resolveDeckStatus, splitFrontmatter } from '#shared/deck'
import { gateDeckAccess } from '../../utils/access'
import { useDraftStore } from '../../utils/collab'
import { resolveDeckForRoute } from '../../utils/deck-resolution'
import { readPresentationContent } from '../../utils/presentations'
import { useDbContent } from '../../utils/sources'

/**
 * Serve a deck by slug: the published database version first, else the committed
 * file. Status and access derive from the served markdown itself — the same
 * derivation chain the publish act uses.
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

  const { content: stub, status } = result
  const stubMeta = splitFrontmatter(stub).data

  await gateDeckAccess(event, {
    slug,
    status,
    storedHash: stubMeta.accessPassword as string | undefined,
  })

  const { content, editUrl } = await resolveDeckForRoute({
    stub,
    source: stubMeta.source as NoteSource | undefined,
    noteId: stubMeta.noteId as string | undefined,
    noteOverride: [],
  })

  return { content, status, editUrl, writable: useDraftStore().isWritable() }
})
