import { isDeckPage } from '#shared/origins'

/**
 * On an instance that serves its decks apart from the studio, a page renders on
 * its own origin alone. A link between a deck page and a page of the studio
 * leaves the origin: the browser loads it, and the server sends it to the other
 * origin, with a ticket when the studio gives one. On the server, this check
 * follows the one of `server/middleware/00.origins.ts` with the route the router
 * matched.
 *
 * In the browser the middleware sets the address itself: `navigateTo` with
 * `external` stops the scope of the app first, which removes its head entries,
 * the colors of Nuxt UI among them, while the next page loads.
 */
export default defineNuxtRouteMiddleware((to) => {
  const side = useOriginSide().value
  if (side === 'single' || (side === 'decks') === isDeckPage(to.path))
    return
  if (import.meta.server)
    return navigateTo(to.fullPath, { external: true })
  window.location.assign(to.fullPath)
  return abortNavigation()
})
