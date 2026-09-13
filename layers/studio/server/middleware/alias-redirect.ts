import { readBundleConfig } from '@vignettes/freeze/bundle'
import { deckDirectory } from '../utils/sources'

/**
 * 301-redirect any `/slides/<x>` that resolves to a directory entry (by alias, stub
 * slug, or historical `aliases:` path) to its canonical `/p/<alias>`, so a single
 * URL serves each deck. Decks not in the directory pass through untouched.
 *
 * `?draft` is the editors' view of the slug route and stays on it.
 *
 * A frozen bundle holds that one deck and nothing to canonicalise against: the
 * redirect would prerender a stub pointing back at the live site, so bundle mode
 * serves the deck page itself.
 */
export default defineEventHandler(async (event) => {
  const path = event.path || ''

  if (!path.startsWith('/slides/') || readBundleConfig().enabled)
    return
  const query = getQuery(event)
  if ('draft' in query)
    return

  // Normalise to the form stored in the registry (`<slug>`, `codimd/<id>`…).
  const candidate = path.replace(/^\/slides\//, '').replace(/\/+$/, '').split('?')[0]
  if (!candidate)
    return

  const entry = await deckDirectory.resolveAlias(candidate)
  if (entry) {
    await sendRedirect(event, `/p/${entry.alias}`, 301)
  }
})
