import { resolveDeck, resolveDeckStatus, splitFrontmatter } from '#shared/deck'
import { yDocUpdateToMarkdown } from '#shared/deck/ydoc'
import { assertCanEditDeck, gateDeckAccess } from '../../utils/access'
import { useDraftStore } from '../../utils/collab'
import { useDbContent, useDeckMeta } from '../../utils/sources'

/**
 * Serve a deck by slug from its published database version. For managed decks the
 * database row is the status/access truth (admin edits win over the served
 * frontmatter).
 *
 * `?draft` (editors only) loads the working draft instead, with the published
 * text alongside so the editor can tell which changes the visitors do not see yet.
 */
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) {
    throw createError({ statusCode: 400, statusMessage: 'Slug parameter is required' })
  }

  if ('draft' in getQuery(event)) {
    await assertCanEditDeck(event, slug)
    const store = useDbContent()
    const draft = await useDraftStore().load(slug).then(update => update && yDocUpdateToMarkdown(update))
    const published = await store.source.load(slug)
    const content = draft ?? published?.raw
    if (!content) {
      throw createError({ statusCode: 404, statusMessage: `Presentation "${slug}" not found` })
    }
    const meta = await useDeckMeta().get(slug)
    return {
      content,
      status: meta?.managed ? meta.status : resolveDeckStatus(content),
      title: meta?.managed ? meta.title : (splitFrontmatter(content).data.title as string | undefined),
      from: draft ? 'draft' as const : 'published' as const,
      writable: useDraftStore().isWritable(),
      // Echoed back by a solo save so a concurrent draft is detected, not clobbered.
      stamp: await useDraftStore().stamp(slug),
      publishedRaw: published?.raw ?? null,
      publishedAt: (await store.publishedAt(slug))?.getTime() ?? null,
    }
  }

  const published = await useDbContent().source.load(slug)
  if (!published) {
    throw createError({ statusCode: 404, statusMessage: `Presentation "${slug}" not found` })
  }

  const meta = await useDeckMeta().get(slug)
  const stub = published.raw
  const stubMeta = splitFrontmatter(stub).data
  const status = meta?.managed ? meta.status : resolveDeckStatus(stub)

  await gateDeckAccess(event, {
    slug,
    status,
    storedHash: meta?.managed
      ? meta.accessPasswordHash
      : stubMeta.accessPassword as string | undefined,
  })

  return { content: resolveDeck({ stub }).content, status, writable: useDraftStore().isWritable() }
})
