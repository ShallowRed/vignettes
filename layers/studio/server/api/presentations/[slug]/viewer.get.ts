import { isFrozen, variantsOf } from '#shared/presentations'
import { canActorEditDeck } from '../../../utils/access'
import { getActor } from '../../../utils/actor'
import { listVisiblePresentations, unpublishedChanges } from '../../../utils/catalog'
import { useDeckMeta } from '../../../utils/sources'

/**
 * What the deck page offers the current visitor beside the deck: the other
 * versions of its family they may open, and for whoever may edit, the draft
 * and the way back to the folder. The variants come from the visitor's own
 * catalog, so a visitor learns nothing they could not list.
 */
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug)
    throw createError({ statusCode: 400, statusMessage: 'Slug parameter is required' })

  const meta = await useDeckMeta().get(slug)
  // A variant with nothing published yet has no page to open.
  const variants = meta?.family
    ? variantsOf(slug, await listVisiblePresentations(event))
        .filter(d => d.published !== false)
        .map(d => ({ slug: d.slug, alias: d.alias ?? null, title: d.title, variantLabel: d.variantLabel ?? d.slug }))
    : []
  const actor = await getActor(event)
  if (!meta || isFrozen(meta) || !await canActorEditDeck(actor, slug))
    return { canEdit: false as const, variants }

  return {
    canEdit: true as const,
    variants,
    unpublishedChanges: meta.published && (await unpublishedChanges(new Set([slug]))).has(slug),
    project: meta.project ?? null,
  }
})
