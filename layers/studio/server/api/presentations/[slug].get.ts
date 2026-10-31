import type { DeckDraftSource } from '#shared/presentations'
import { yDocUpdateToMarkdown } from '#shared/collab/ydoc'
import { resolveDeck, resolveDeckStatus, splitFrontmatter } from '@vignettes/core/deck'
import { assertCanReadDraft, gateDeckAccess, gateOptionsOf } from '../../utils/access'
import { useDraftStore } from '../../utils/collab'
import { serverConfig } from '../../utils/config'
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
    await assertCanReadDraft(event, slug)
    const store = useDbContent()
    const draft = await useDraftStore().load(slug).then(update => update && yDocUpdateToMarkdown(update))
    const published = await store.source.load(slug)
    const content = draft ?? published?.raw
    if (!content) {
      throw createError({ statusCode: 404, statusMessage: 'Not found' })
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
    } satisfies DeckDraftSource
  }

  const published = await useDbContent().source.load(slug)
  if (!published) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const stub = published.raw
  const gate = await gateOptionsOf(slug)
  if (!gate)
    throw createError({ statusCode: 404, statusMessage: 'Not found' })

  await gateDeckAccess(event, gate)

  // A frozen bundle carries its own Storybook copy: point the deck's embeds at it.
  const bundle = serverConfig().bundle
  const content = resolveDeck({ stub, storybookBase: bundle.enabled ? bundle.storybookUrl : undefined }).content
  return { content, status: gate.status, writable: useDraftStore().isWritable() }
})
