import { isDeckSlug } from '@vignettes/core/deck'
import { assertContentScript } from '../../utils/access'
import { useContentArchive } from '../../utils/sources'

/**
 * GET /api/content/decks?slugs=a,b, for `content:pull`: the catalog axes and the
 * published markdown of these live decks, null for a slug the instance does not
 * serve. The access password column stays on the instance; a hash written in
 * the frontmatter travels with the markdown.
 */
export default defineEventHandler(async (event) => {
  await assertContentScript(event)
  const slugs = String(getQuery(event).slugs ?? '').split(',').filter(Boolean)
  if (slugs.length === 0 || !slugs.every(isDeckSlug))
    throw createError({ statusCode: 400, statusMessage: 'A ?slugs=<slug>[,<slug>] parameter is required' })
  const decks = new Map((await useContentArchive().decks()).filter(deck => !deck.trashed).map(deck => [deck.slug, deck]))
  return slugs.map((slug) => {
    const deck = decks.get(slug)
    if (!deck)
      return null
    const { title, status, lifecycle, project, theme, alias, frozenBundle, unlisted, raw } = deck
    return { slug, title, status, lifecycle, project, theme, alias, frozenBundle, unlisted, raw }
  })
})
