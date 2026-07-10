import type { Role } from '#shared/access'
import { isPrivileged } from '#shared/access'

/**
 * Route guard for owner/editor-only pages (e.g. /admin). Replaces the auth check
 * that lived inside the admin component. Not logged in → /login; logged in but
 * not privileged (a viewer) → / (the public catalog).
 *
 * This is UX/defense-in-depth: the API handlers remain the real enforcement
 * boundary (they gate by role server-side regardless of navigation).
 */
export default defineNuxtRouteMiddleware(async (to) => {
  // useRequestFetch (pas $fetch nu) : pendant le rendu SSR de /admin, il réémet
  // les en-têtes de la requête entrante — dont le cookie de session. Sans lui,
  // /api/auth/session est appelé sans cookie → « déconnecté » → rebond vers /login
  // alors que la session existe bel et bien.
  const requestFetch = useRequestFetch()
  const session = await requestFetch<{ loggedIn: boolean, role: Role }>('/api/auth/session')
    .catch(() => null)

  // Not logged in → login, remembering where they were headed.
  if (!session?.loggedIn)
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })

  // Logged in but not privileged (a viewer) → a clear "forbidden" page rather
  // than a silent bounce, so they understand why they can't proceed.
  if (!isPrivileged(session.role))
    return navigateTo({ path: '/forbidden', query: { from: to.fullPath } })
})
