import type { PresentationListItem } from '#shared/presentations'
import type { Project } from '#shared/projects'
import { useAppSession } from '~/composables/useAppSession'

/**
 * Shared client view of the catalog: the access-filtered deck listing and the
 * project folders, both session-dependent and both owned here so every page and
 * mutation reads and refreshes the *same* state (keyed `presentations` /
 * `projects`). This is what makes a create/delete reflect instantly instead of
 * only on a hard refresh.
 *
 * SSR/hydration contract (learned the hard way, see the inline notes):
 *  - `useRequestFetch` re-emits the incoming session cookie during SSR, so both
 *    endpoints see the logged-in actor (else a logged-in user gets the anonymous
 *    listing on first paint).
 *  - Keep the SSR payload during hydration only; never reuse it on later client
 *    navigation (that is how a stale anonymous listing used to come back).
 *  - Refetch both on login so a newly privileged actor sees their private decks
 *    and folders without reloading.
 */
export async function useCatalog() {
  const { privileged } = useAppSession()
  const nuxtApp = useNuxtApp()
  const requestFetch = useRequestFetch()

  function sessionScopedCache(key: string) {
    return nuxtApp.isHydrating ? nuxtApp.payload.data[key] : undefined
  }

  // Awaited so SSR blocks on both fetches (the pages render with data present,
  // no post-hydration flash of the empty state).
  const [presentationsAsync, projectsAsync] = await Promise.all([
    useAsyncData(
      'presentations',
      () => requestFetch<PresentationListItem[]>('/api/presentations'),
      { default: () => [] as PresentationListItem[], getCachedData: sessionScopedCache },
    ),
    useAsyncData(
      'projects',
      () => requestFetch<Project[]>('/api/projects'),
      { default: () => [] as Project[], getCachedData: sessionScopedCache },
    ),
  ])

  const refreshPresentations = () => presentationsAsync.refresh()
  const refreshProjects = () => projectsAsync.refresh()
  const refreshAll = () => Promise.all([refreshPresentations(), refreshProjects()])

  // Login reveals private decks and their folders; refetch both so the view
  // reflects the new role without a reload.
  watch(privileged, (now, before) => {
    if (now && !before)
      refreshAll()
  })

  return {
    presentations: presentationsAsync.data,
    presentationsStatus: presentationsAsync.status,
    presentationsError: presentationsAsync.error,
    projects: projectsAsync.data,
    refreshPresentations,
    refreshProjects,
    refreshAll,
  }
}
