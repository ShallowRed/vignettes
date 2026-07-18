import type { NoteSource } from '#shared/deck'
import { resolveDeckStatus, splitFrontmatter } from '#shared/deck'
import { yDocUpdateToMarkdown } from '#shared/deck/ydoc'
import { assertCanEditDeck, gateDeckAccess } from '../../utils/access'
import { useDraftStore } from '../../utils/collab'
import { resolveDeckForRoute } from '../../utils/deck-resolution'
import { readPresentationContent } from '../../utils/presentations'
import { useDbContent, useDeckMeta } from '../../utils/sources'

/**
 * Serve a deck by slug: the published database version first, else the committed
 * file. For managed decks the database row is the status/access truth (admin
 * edits win over the served frontmatter); everything else keeps deriving from
 * the markdown itself.
 *
 * `?draft` (editors only) loads the working draft first instead — the editor
 * must show what "Enregistrer" saved, not the published version.
 */
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) {
    throw createError({ statusCode: 400, statusMessage: 'Slug parameter is required' })
  }

  if ('draft' in getQuery(event)) {
    await assertCanEditDeck(event, slug)
    const draft = await useDraftStore().load(slug).then(update => update && yDocUpdateToMarkdown(update))
    const published = draft ? null : await useDbContent().source.load(slug)
    const fallback = draft || published ? null : await readPresentationContent(slug)
    const content = draft ?? published?.raw ?? fallback?.content
    if (!content) {
      throw createError({ statusCode: 404, statusMessage: `Presentation "${slug}" not found` })
    }
    const meta = await useDeckMeta().get(slug)
    return {
      content,
      status: meta?.managed ? meta.status : resolveDeckStatus(content),
      title: meta?.managed ? meta.title : (splitFrontmatter(content).data.title as string | undefined),
      from: draft ? 'draft' as const : published ? 'published' as const : 'file' as const,
      writable: useDraftStore().isWritable(),
    }
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
