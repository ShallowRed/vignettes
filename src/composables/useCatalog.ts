import type { PresentationListItem } from '#shared/presentations'
import type { Project } from '#shared/projects'
import { useQuery, useQueryCache } from '@pinia/colada'
import { catalogApi } from '~/api'
import { useAppSession } from '~/composables/useAppSession'
import { catalogKeys } from '~/queries/keys'

/**
 * The app-wide catalog data layer, on Pinia Colada. Both the access-filtered deck
 * listing and the project folders are session-dependent queries shared by every
 * page and component through their cache key — a create/delete anywhere reflects
 * everywhere via invalidation, with no manual refresh threading.
 *
 * SSR/session contract:
 *  - `useRequestFetch` re-emits the incoming session cookie during SSR so the
 *    server render sees the logged-in actor (else a private listing renders as
 *    anonymous, then flips on the client). It is captured in setup, as required.
 *  - `useQuery` hydrates automatically via `onServerPrefetch` (no `await`).
 *  - Login reveals private decks/folders: invalidate both queries so they refetch
 *    with the new role. `useQueryCache` is resolved in setup (never in the
 *    callback) to keep the injection context — see error PINIA_COLADA_C0001.
 */
export function useCatalog() {
  const { privileged } = useAppSession()
  const requestFetch = useRequestFetch()
  const queryCache = useQueryCache()

  const presentationsQuery = useQuery({
    key: catalogKeys.presentations,
    query: () => catalogApi.listPresentations(requestFetch),
  })
  const projectsQuery = useQuery({
    key: catalogKeys.projects,
    query: () => catalogApi.listProjects(requestFetch),
  })

  // Never undefined for the templates (arrays are iterated/filtered directly).
  const presentations = computed<PresentationListItem[]>(() => presentationsQuery.data.value ?? [])
  const projects = computed<Project[]>(() => projectsQuery.data.value ?? [])

  watch(privileged, (now, before) => {
    if (now && !before) {
      queryCache.invalidateQueries({ key: catalogKeys.presentations })
      queryCache.invalidateQueries({ key: catalogKeys.projects })
    }
  })

  return {
    presentations,
    presentationsStatus: presentationsQuery.status,
    presentationsError: presentationsQuery.error,
    projects,
    refreshPresentations: () => presentationsQuery.refresh(),
    refreshProjects: () => projectsQuery.refresh(),
    refreshAll: () => Promise.all([presentationsQuery.refresh(), projectsQuery.refresh()]),
  }
}

/**
 * Cache-side helpers for catalog mutations: keep the invalidation and the
 * optimistic edits in one place so the write modals stay thin and consistent.
 * Resolve this in the component setup (it captures `useQueryCache`), then use the
 * returned functions inside mutation hooks.
 */
export function useCatalogCache() {
  const queryCache = useQueryCache()

  /** Refetch both catalog queries — the default "a write happened" reaction. */
  function invalidateAll() {
    return Promise.all([
      queryCache.invalidateQueries({ key: catalogKeys.presentations }),
      queryCache.invalidateQueries({ key: catalogKeys.projects }),
    ])
  }

  function invalidatePresentations() {
    return queryCache.invalidateQueries({ key: catalogKeys.presentations })
  }

  /**
   * Optimistically drop a project and its decks from the caches before the
   * delete resolves. Returns the previous snapshot for rollback on error.
   */
  function removeProjectOptimistic(slug: string) {
    const previousProjects = queryCache.getQueryData<Project[]>(catalogKeys.projects)
    const previousPresentations = queryCache.getQueryData<PresentationListItem[]>(catalogKeys.presentations)
    if (previousProjects)
      queryCache.setQueryData(catalogKeys.projects, previousProjects.filter(p => p.slug !== slug))
    if (previousPresentations)
      queryCache.setQueryData(catalogKeys.presentations, previousPresentations.filter(d => d.project !== slug))
    return { previousProjects, previousPresentations }
  }

  /** Roll a failed optimistic project delete back to its snapshot. */
  function restoreSnapshot(snapshot: { previousProjects?: Project[], previousPresentations?: PresentationListItem[] }) {
    if (snapshot.previousProjects)
      queryCache.setQueryData(catalogKeys.projects, snapshot.previousProjects)
    if (snapshot.previousPresentations)
      queryCache.setQueryData(catalogKeys.presentations, snapshot.previousPresentations)
  }

  return { invalidateAll, invalidatePresentations, removeProjectOptimistic, restoreSnapshot }
}
