import type { Role } from '#shared/access'
import { isPrivileged } from '#shared/access'

interface AppSession {
  loggedIn: boolean
  role: Role
  user: { login?: string, name?: string, avatar?: string } | null
}

/**
 * Single client-side view of the session, including our resolved access `role`
 * (which `nuxt-auth-utils`' own `useUserSession` does not expose). Cached in
 * `useState` so the header, route guards and pages share one fetch instead of
 * each hitting `/api/auth/session`. The server API stays the enforcement
 * boundary; this is purely for UI gating and identity display.
 */
export function useAppSession() {
  const state = useState<AppSession | null>('app-session', () => null)

  // Capté dans le scope setup : en SSR, useRequestFetch réémet le cookie de
  // session de la requête entrante (sinon l'entête rend « déconnecté » alors que
  // l'utilisateur est loggé). Côté client, c'est un $fetch normal.
  const requestFetch = useRequestFetch()

  async function refresh() {
    state.value = await requestFetch<AppSession>('/api/auth/session').catch(() => null)
    return state.value
  }

  // Resolve once on first use (SSR-friendly via useState + useAsyncData key).
  const { status } = useAsyncData('app-session', () => refresh(), {
    // Don't refetch if another caller already populated it.
    immediate: state.value === null,
  })

  // Les pages prérendues (/, /login, slides publics — cf. routeRules) figent une
  // session « déconnecté » au build, et le payload SSG empêche tout refetch. On
  // re-résout donc la session UNE fois après hydratation (le cookie part
  // automatiquement côté client) pour que le header reflète l'auth réelle.
  // Sinon : connecté sur /admin (SSR) mais « sign in » sur / (prérendu).
  if (import.meta.client) {
    const revalidated = useState('app-session-revalidated', () => false)
    if (!revalidated.value) {
      revalidated.value = true
      onNuxtReady(() => { refresh() })
    }
  }

  const loggedIn = computed(() => state.value?.loggedIn ?? false)
  const role = computed<Role>(() => state.value?.role ?? 'anonymous')
  const user = computed(() => state.value?.user ?? null)
  const privileged = computed(() => isPrivileged(role.value))

  return { session: state, loggedIn, role, user, privileged, status, refresh }
}
