import type { TrashedDeckSummary, TrashedProjectSummary, TrashTarget } from '#shared/trash'
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { trashApi } from '../api'
import { catalogKeys, trashKeys, trashQuery } from '../queries'
import { useAppSession } from './useAppSession'

/**
 * The trash (corbeille) data layer, on Pinia Colada. One query for the listing,
 * two mutations (restore / permanent purge). A restore brings a project or deck
 * back into the catalog, so it invalidates the catalog queries too; a purge only
 * touches the trash. `useRequestFetch` forwards the session cookie (the endpoint
 * is privileged) so the listing renders correctly on SSR.
 */
export function useTrash() {
  const requestFetch = useRequestFetch()
  const queryCache = useQueryCache()
  const toast = useToast()
  const { privileged } = useAppSession()

  // Trash is privileged-only: gating the query keeps an anonymous SSR pass from
  // hitting a 401 (which would surface as an error response instead of the page's
  // "accès réservé" state).
  const trashQ = useQuery({ ...trashQuery(requestFetch), enabled: () => privileged.value })

  const projects = computed<TrashedProjectSummary[]>(() => trashQ.data.value?.projects ?? [])
  const decks = computed<TrashedDeckSummary[]>(() => trashQ.data.value?.decks ?? [])
  const isEmpty = computed(() => projects.value.length === 0 && decks.value.length === 0)

  function invalidateTrash() {
    return queryCache.invalidateQueries({ key: trashKeys.all })
  }
  function invalidateCatalog() {
    return Promise.all([
      queryCache.invalidateQueries({ key: catalogKeys.presentations }),
      queryCache.invalidateQueries({ key: catalogKeys.projects }),
    ])
  }
  function toastError(error: any) {
    toast.add({ title: error?.statusMessage || 'Échec', icon: 'i-lucide-triangle-alert', color: 'error' })
  }

  const restore = useMutation({
    mutation: (t: TrashTarget) => trashApi.restore(requestFetch, t),
    onSuccess(_data, t) {
      toast.add({
        title: t.kind === 'project' ? 'Dossier restauré' : 'Présentation restaurée',
        icon: 'i-lucide-check',
        color: 'success',
      })
    },
    onError: toastError,
    // A restored item re-enters the catalog: refetch both the trash and the catalog.
    onSettled: () => Promise.all([invalidateTrash(), invalidateCatalog()]),
  })

  const purge = useMutation({
    mutation: (t: TrashTarget) => trashApi.purge(requestFetch, t),
    onSuccess() {
      toast.add({ title: 'Supprimé définitivement', icon: 'i-lucide-check', color: 'success' })
    },
    onError: toastError,
    onSettled: invalidateTrash,
  })

  const busy = computed(() => restore.isLoading.value || purge.isLoading.value)

  return {
    projects,
    decks,
    isEmpty,
    status: trashQ.status,
    error: trashQ.error,
    canView: privileged,
    busy,
    restore: async (target: TrashTarget): Promise<void> => { await restore.mutateAsync(target) },
    purge: async (target: TrashTarget): Promise<void> => { await purge.mutateAsync(target) },
  }
}
