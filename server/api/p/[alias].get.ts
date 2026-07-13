import type { NoteSource } from '#shared/deck'
import { resolveDeckStatus, splitFrontmatter } from '#shared/deck'
import { gateDeckAccess } from '../../utils/access'
import { resolveDeckForRoute } from '../../utils/deck-resolution'
import { readArchivedStub, readPresentationContent } from '../../utils/presentations'
import { resolveAlias } from '../../utils/registry'

/**
 * GET /api/p/:alias — resolve an alias through the registry and serve content per
 * lifecycle: live (stub frontmatter + collaborative body) or frozen/archived
 * (report the static bundle URL). `noteOverride: ['storybook']` makes the diffused
 * URL use the public Storybook from the live note, not the stub's local-dev one.
 */
export default defineEventHandler(async (event) => {
  const alias = getRouterParam(event, 'alias')
  if (!alias) {
    throw createError({ statusCode: 400, statusMessage: 'alias parameter is required' })
  }

  const entry = await resolveAlias(alias)
  if (!entry) {
    throw createError({ statusCode: 404, statusMessage: `Unknown presentation alias "${alias}"` })
  }

  // Frozen/archived stubs live in presentations/archived/ (skipped by the flat
  // reader), so they need the dedicated archived reader.
  const isFrozen = entry.lifecycle === 'frozen' || entry.lifecycle === 'archived'
  const stub = isFrozen
    ? await readArchivedStub(entry.slug)
    : (await readPresentationContent(entry.slug))?.content ?? null
  if (stub == null) {
    throw createError({
      statusCode: 404,
      statusMessage: `Stub "${entry.slug}" for alias "${alias}" not found`,
    })
  }

  const stubMeta = splitFrontmatter(stub).data
  const status = resolveDeckStatus(stub, entry.access)

  // Gate BEFORE the frozen short-circuit — a frozen private deck must not be
  // served just because it has a bundle.
  await gateDeckAccess(event, {
    slug: entry.slug,
    status,
    lifecycle: entry.lifecycle,
    storedHash: stubMeta.accessPassword as string | undefined,
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

  const { content, editUrl } = await resolveDeckForRoute({
    stub,
    source: entry.source as NoteSource | undefined,
    noteId: entry.noteId,
    noteOverride: ['storybook'],
  })

  return { lifecycle: entry.lifecycle, content, editUrl }
})
