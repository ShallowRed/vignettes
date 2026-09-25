import type { TrashedDeckSummary, TrashedProjectSummary, TrashTarget } from '#shared/trash'
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { trashApi } from '../api'
import { catalogKeys, trashKeys, trashQuery } from '../queries'
import { requestErrorMessage } from '../utils/request-error'
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
  const { t } = useI18n()
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
    toast.add({ title: requestErrorMessage(error, t('admin.trash.failed')), icon: 'i-lucide-triangle-alert', color: 'error' })
  }

  const restore = useMutation({
    mutation: (target: TrashTarget) => trashApi.restore(requestFetch, target),
    onSuccess(_data, target) {
      toast.add({
        title: target.kind === 'project' ? t('admin.trash.folderRestored') : t('admin.trash.deckRestored'),
        icon: 'i-lucide-check',
        color: 'success',
      })
    },
    onError: toastError,
    // A restored item re-enters the catalog: refetch both the trash and the catalog.
    onSettled: () => Promise.all([invalidateTrash(), invalidateCatalog()]),
  })

  const purge = useMutation({
    mutation: (target: TrashTarget) => trashApi.purge(requestFetch, target),
    onSuccess() {
      toast.add({ title: t('admin.trash.purged'), icon: 'i-lucide-check', color: 'success' })
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
    refresh: () => trashQ.refresh(),
    canView: privileged,
    busy,
    restore: async (target: TrashTarget): Promise<void> => { await restore.mutateAsync(target) },
    purge: async (target: TrashTarget): Promise<void> => { await purge.mutateAsync(target) },
  }
}
