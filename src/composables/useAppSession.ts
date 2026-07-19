import type { Role } from '#shared/access'
import { isPrivileged } from '#shared/access'

interface AppSession {
  loggedIn: boolean
  role: Role
  user: { login?: string, name?: string, avatar?: string } | null
}

/**
 * Single client-side view of the session, including our resolved access `role`
 * (which `nuxt-auth-utils`' `useUserSession` does not expose). Cached in `useState`
 * so header, guards and pages share one fetch. The server API stays the enforcement
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

  const { status } = useAsyncData('app-session', () => refresh(), {
    immediate: state.value === null, // don't refetch if another caller populated it
  })

  // Prerendered pages (/, /login, public slides) freeze a "logged out" session at
  // build and the SSG payload blocks any refetch. Re-resolve once after hydration
  // so the header reflects real auth; otherwise: logged in on /admin (SSR) but
  // "sign in" on / (prerendered).
  if (import.meta.client) {
    const revalidated = useState('app-session-revalidated', () => false)
    if (!revalidated.value) {
      revalidated.value = true
      onNuxtReady(() => refresh())
    }
  }

  const loggedIn = computed(() => state.value?.loggedIn ?? false)
  const role = computed<Role>(() => state.value?.role ?? 'anonymous')
  const user = computed(() => state.value?.user ?? null)
  const privileged = computed(() => isPrivileged(role.value))

  return { session: state, loggedIn, role, user, privileged, status, refresh }
}
