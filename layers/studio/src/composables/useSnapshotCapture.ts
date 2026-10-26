import { useMutation, useQueryCache } from '@pinia/colada'
import { historyApi } from '../api'
import { deckKeys } from '../queries'
import { requestErrorMessage } from '../utils/request-error'

/**
 * The capture of a snapshot of a deck's draft, with or without a name, and its
 * message. The server keeps no unnamed copy of a text the last snapshot already
 * holds: `onCaptured` then receives false.
 */
export function useSnapshotCapture(slug: string, onCaptured?: (kept: boolean) => void) {
  const toast = useToast()
  const queryCache = useQueryCache()
  const { t, locale } = useI18n()

  const { mutate: capture, isLoading: capturing } = useMutation({
    mutation: (label?: string) => historyApi.snapshot($fetch, slug, label?.trim() || undefined),
    onSuccess(result) {
      const kept = result.id !== null
      toast.add(kept
        ? { title: t('deck.history.snapshotCapturedAt', { time: new Date().toLocaleTimeString(locale.value, { timeStyle: 'short' }) }), icon: 'i-lucide-check', color: 'success' }
        : { title: t('deck.history.snapshotUnchanged'), icon: 'i-lucide-check', color: 'success' })
      onCaptured?.(kept)
    },
    onError(error: any) {
      toast.add({ title: requestErrorMessage(error, t('deck.history.snapshotFailed')), icon: 'i-lucide-triangle-alert', color: 'error' })
    },
    onSettled: () => queryCache.invalidateQueries({ key: deckKeys.history(slug) }),
  })

  return { capture, capturing }
}
