import type { DeckVariant, DeckViewer } from '#shared/presentations'
import { variantsOf } from '#shared/presentations'
import { canActorEditDeck } from '../../../utils/access'
import { getDeckActor } from '../../../utils/actor'
import { listVisiblePresentations, unpublishedChanges } from '../../../utils/catalog'
import { useDbContent, useDeckMeta } from '../../../utils/sources'

/**
 * What the deck page offers the current visitor beside the deck: the other
 * versions of its family they may open, and for whoever may edit, the draft,
 * whether a version is published, and the way back to the folder. The variants
 * come from the visitor's own catalog, so a visitor learns nothing they could
 * not list; on the deck origin, from the catalog of an anonymous visitor, so
 * that a script of the deck learns no other deck from the view pass.
 */
/** The family members the visitor may open. A member with nothing published has no page. */
async function familyVariants(event: Parameters<typeof listVisiblePresentations>[0], slug: string): Promise<DeckVariant[]> {
  const [visible, rows] = await Promise.all([listVisiblePresentations(event), useDeckMeta().listManaged()])
  const published = new Set(rows.filter(d => d.published).map(d => d.slug))
  return variantsOf(slug, visible)
    .filter(d => published.has(d.slug))
    .map(d => ({ slug: d.slug, alias: d.alias ?? null, title: d.title, variantLabel: d.variantLabel ?? d.slug }))
}

export default defineEventHandler(async (event): Promise<DeckViewer> => {
  const slug = getRouterParam(event, 'slug')
  if (!slug)
    throw createError({ statusCode: 400, statusMessage: 'Slug parameter is required' })

  const meta = await useDeckMeta().get(slug)
  const variants = meta?.family ? await familyVariants(event, slug) : []
  const actor = await getDeckActor(event, slug)
  const signedIn = Boolean(actor.id)
  if (!meta || !await canActorEditDeck(actor, slug))
    return { canEdit: false as const, signedIn, variants }

  const versionId = meta.published ? await useDbContent().publishedVersion(slug) : null
  return {
    canEdit: true as const,
    signedIn,
    variants,
    published: Boolean(meta.published),
    unpublishedChanges: versionId !== null && (await unpublishedChanges(new Map([[slug, versionId]]))).has(slug),
    project: meta.project ?? null,
  }
})
