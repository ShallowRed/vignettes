import type { AppSession, Role } from '#shared/access'
import { isPrivileged } from '#shared/access'

/**
 * Single client-side view of the session, including our resolved access `role`
 * (which `nuxt-auth-utils`' `useUserSession` does not expose). The state is seeded
 * during SSR by the `app-session` plugin (from the server middleware), so the
 * header renders the same auth branch on server and client. Cached in `useState`
 * so header, guards and pages share it. The server API stays the enforcement
 * boundary; this is purely for UI gating and identity display.
 */
export function useAppSession() {
  const state = useState<AppSession | null>('app-session', () => null)

  // Must be called in setup scope: in SSR useRequestFetch re-emits the incoming
  // session cookie (else the header renders "logged out" for a logged-in user).
  const requestFetch = useRequestFetch()

  async function refresh() {
    state.value = await requestFetch<AppSession>('/api/auth/session').catch(() => null)
    return state.value
  }

  // The SSR seed covers the normal render; only fetch when it is missing (a pure
  // client navigation that never hit the middleware, or after login/logout).
  const { status } = useAsyncData('app-session', () => refresh(), {
    immediate: state.value === null,
  })

  const loggedIn = computed(() => state.value?.loggedIn ?? false)
  const role = computed<Role>(() => state.value?.role ?? 'anonymous')
  const user = computed(() => state.value?.user ?? null)
  const privileged = computed(() => isPrivileged(role.value))
  const owner = computed(() => role.value === 'owner')

  return { session: state, loggedIn, role, user, privileged, owner, status, refresh }
}
