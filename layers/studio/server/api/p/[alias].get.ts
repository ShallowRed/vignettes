import { resolveDeck } from '@vignettes/core/deck'
import { gateDeckAccess, gateOptionsOf } from '../../utils/access'
import { deckDirectory, publishedSource } from '../../utils/sources'

/**
 * GET /api/p/:alias — resolve an alias through the directory and serve content
 * per lifecycle: live (the published markdown) or frozen/archived (report the
 * static bundle URL). The body is always the deck's published database version.
 */
export default defineEventHandler(async (event) => {
  const alias = getRouterParam(event, 'alias')
  if (!alias) {
    throw createError({ statusCode: 400, statusMessage: 'alias parameter is required' })
  }

  const entry = await deckDirectory.resolveAlias(alias)
  if (!entry) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  // Every deck (live or frozen) serves its published database version; frozen
  // decks keep it for gating even though the body itself is a static bundle.
  const stub = (await publishedSource.load(entry.slug))?.raw ?? null
  if (stub == null) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Not found',
    })
  }

  const gate = await gateOptionsOf(entry.slug, { lifecycle: entry.lifecycle, folderStatus: entry.access })
  if (!gate)
    throw createError({ statusCode: 404, statusMessage: 'Not found' })

  // The gate comes before the frozen redirect, so a frozen private deck is not
  // served for having a bundle. The unlock form verifies its password here.
  await gateDeckAccess(event, { ...gate, unlock: true })

  // Frozen/archived: content is a static bundle; report the target to redirect to.
  if (entry.lifecycle === 'frozen' || entry.lifecycle === 'archived') {
    const bundle = entry.frozenBundle ?? entry.slug
    return {
      lifecycle: entry.lifecycle,
      frozenUrl: `/frozen/${bundle}/slides/${entry.slug}--standalone/`,
      content: '',
    }
  }

  return { lifecycle: entry.lifecycle, slug: entry.slug, content: resolveDeck({ stub }).content }
})
