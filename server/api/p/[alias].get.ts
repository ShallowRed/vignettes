import { resolveDeck, resolveDeckStatus, splitFrontmatter } from '#shared/deck'
import { gateDeckAccess } from '../../utils/access'
import { readArchivedStub } from '../../utils/presentations'
import { deckDirectory, publishedSource, useDeckMeta } from '../../utils/sources'

/**
 * GET /api/p/:alias — resolve an alias through the directory and serve content
 * per lifecycle: live (the published markdown) or frozen/archived (report the
 * static bundle URL). The body is always the deck's published version now; the
 * collaborative-note fetch was retired in favour of the integrated editor.
 */
export default defineEventHandler(async (event) => {
  const alias = getRouterParam(event, 'alias')
  if (!alias) {
    throw createError({ statusCode: 400, statusMessage: 'alias parameter is required' })
  }

  const entry = await deckDirectory.resolveAlias(alias)
  if (!entry) {
    throw createError({ statusCode: 404, statusMessage: `Unknown presentation alias "${alias}"` })
  }

  // Frozen/archived stubs live in presentations/archived/ (skipped by the flat
  // reader), so they need the dedicated archived reader. Live decks go through
  // the published chain (database version first, committed file else).
  const isFrozen = entry.lifecycle === 'frozen' || entry.lifecycle === 'archived'
  const stub = isFrozen
    ? await readArchivedStub(entry.slug)
    : (await publishedSource.load(entry.slug))?.raw ?? null
  if (stub == null) {
    throw createError({
      statusCode: 404,
      statusMessage: `Stub "${entry.slug}" for alias "${alias}" not found`,
    })
  }

  const meta = await useDeckMeta().get(entry.slug)
  const stubMeta = splitFrontmatter(stub).data
  const status = meta?.managed ? meta.status : resolveDeckStatus(stub, entry.access)

  // Gate BEFORE the frozen short-circuit — a frozen private deck must not be
  // served just because it has a bundle.
  await gateDeckAccess(event, {
    slug: entry.slug,
    status,
    lifecycle: entry.lifecycle,
    storedHash: meta?.managed
      ? meta.accessPasswordHash
      : stubMeta.accessPassword as string | undefined,
  })

  // Frozen/archived: content is a static bundle; report the target to redirect to.
  if (entry.lifecycle === 'frozen' || entry.lifecycle === 'archived') {
    const bundle = entry.frozenBundle ?? entry.slug
    return {
      lifecycle: entry.lifecycle,
      frozenUrl: `/frozen/${bundle}/slides/${entry.slug}--standalone/`,
      content: '',
    }
  }

  return { lifecycle: entry.lifecycle, content: resolveDeck({ stub }).content }
})
