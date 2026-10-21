import { isFrozen, variantsOf } from '#shared/presentations'
import { canActorEditDeck } from '../../../utils/access'
import { getActor } from '../../../utils/actor'
import { listVisiblePresentations, unpublishedChanges } from '../../../utils/catalog'
import { useDeckMeta } from '../../../utils/sources'

/**
 * What the deck page offers the current visitor beside the deck: the other
 * versions of its family they may open, and for whoever may edit, the draft,
 * whether a version is published, and the way back to the folder. The variants
 * come from the visitor's own catalog, so a visitor learns nothing they could
 * not list.
 */
/** The family members the visitor may open. A member with nothing published has no page. */
async function familyVariants(event: Parameters<typeof listVisiblePresentations>[0], slug: string) {
  const [visible, rows] = await Promise.all([listVisiblePresentations(event), useDeckMeta().listManaged()])
  const published = new Set(rows.filter(d => d.published).map(d => d.slug))
  return variantsOf(slug, visible)
    .filter(d => published.has(d.slug))
    .map(d => ({ slug: d.slug, alias: d.alias ?? null, title: d.title, variantLabel: d.variantLabel ?? d.slug }))
}

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug)
    throw createError({ statusCode: 400, statusMessage: 'Slug parameter is required' })

  const meta = await useDeckMeta().get(slug)
  const variants = meta?.family ? await familyVariants(event, slug) : []
  const actor = await getActor(event)
  if (!meta || isFrozen(meta) || !await canActorEditDeck(actor, slug))
    return { canEdit: false as const, variants }

  return {
    canEdit: true as const,
    variants,
    published: Boolean(meta.published),
    unpublishedChanges: meta.published && (await unpublishedChanges(new Set([slug]))).has(slug),
    project: meta.project ?? null,
  }
})
