import { isDeckSlug } from '@vignettes/core/deck'
import { assertCanShareDeck, assertOwner } from '../../../../utils/access'
import { useDeckMeta, useProjectPermissionStore } from '../../../../utils/sources'

/**
 * GET /api/admin/projects/:slug/permissions: grants on a project. The owner
 * reads them for any project. With `?deck=<slug>` of a deck in this project,
 * whoever may share that deck reads them too: they open the deck, and its
 * sharing panel lists them beside its own grants.
 */
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug || !isDeckSlug(slug)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid project slug' })
  }

  // The right to share the deck is checked before its folder, so a slug the
  // actor may not see answers as one that does not exist.
  const deck = getQuery(event).deck
  if (typeof deck === 'string' && isDeckSlug(deck)) {
    await assertCanShareDeck(event, deck)
    if (await useDeckMeta().projectOf(deck) !== slug)
      await assertOwner(event)
  }
  else {
    await assertOwner(event)
  }

  return await useProjectPermissionStore().listForProject(slug)
})
