import type { Role } from '#shared/access'
import { isPrivileged } from '#shared/access'

// UX/defense-in-depth guard for owner/editor-only pages; API handlers are the real enforcement boundary.
export default defineNuxtRouteMiddleware(async (to) => {
  // useRequestFetch (not bare $fetch) re-emits the incoming request headers during
  // SSR of /admin — including the session cookie. Without it, /api/auth/session is
  // called cookieless and bounces a logged-in user to /login.
  const requestFetch = useRequestFetch()
  const session = await requestFetch<{ loggedIn: boolean, role: Role }>('/api/auth/session')
    .catch(() => null)

  if (!session?.loggedIn)
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })

  if (!isPrivileged(session.role))
    return navigateTo({ path: '/forbidden', query: { from: to.fullPath } })
})
