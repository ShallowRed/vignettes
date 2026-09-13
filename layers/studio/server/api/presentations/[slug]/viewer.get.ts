import { isFrozen } from '#shared/presentations'
import { canActorEditDeck } from '../../../utils/access'
import { getActor } from '../../../utils/actor'
import { unpublishedChanges } from '../../../utils/catalog'
import { useDeckMeta } from '../../../utils/sources'

/**
 * What the deck page offers the current visitor beside the deck: editing, the
 * draft, and the way back to the folder. A visitor who may not edit learns
 * nothing about the deck from this route.
 */
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug)
    throw createError({ statusCode: 400, statusMessage: 'Slug parameter is required' })

  const meta = await useDeckMeta().get(slug)
  const actor = await getActor(event)
  if (!meta || isFrozen(meta) || !await canActorEditDeck(actor, slug))
    return { canEdit: false as const }

  return {
    canEdit: true as const,
    unpublishedChanges: meta.published && (await unpublishedChanges(new Set([slug]))).has(slug),
    project: meta.project ?? null,
  }
})
