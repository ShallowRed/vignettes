import { resolveAlias } from '../utils/registry'

/**
 * 301-redirect any `/slides/<x>` that resolves to a registry entry (by alias, stub
 * slug, or historical `aliases:` path) to its canonical `/p/<alias>`, so a single
 * URL serves each deck. Decks not in the registry pass through untouched.
 */
export default defineEventHandler(async (event) => {
  const path = event.path || ''

  if (!path.startsWith('/slides/'))
    return

  // Normalise to the form stored in the registry (`<slug>`, `codimd/<id>`…).
  const candidate = path.replace(/^\/slides\//, '').replace(/\/+$/, '').split('?')[0]
  if (!candidate)
    return

  const entry = await resolveAlias(candidate)
  if (entry) {
    await sendRedirect(event, `/p/${entry.alias}`, 301)
  }
})
