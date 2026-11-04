import type { TextRefusal } from '@vignettes/core/deck'

/**
 * The message of a text typed outside the source, on the slide or in the
 * outline, that the document refuses. It holds the only copy of the text: it
 * stays until the person closes it, and offers to copy the text.
 */
export function useRefusedText() {
  const { t } = useI18n()
  const toast = useToast()

  // A browser that refuses the copy gets the text in the message, to select by hand.
  async function copy(typed: string) {
    try {
      await navigator.clipboard.writeText(typed)
      toast.add({ title: t('editor.typedText.copied'), icon: 'i-lucide-clipboard-check', color: 'success' })
    }
    catch {
      toast.add({ title: t('editor.typedText.copyFailed'), description: typed, icon: 'i-lucide-triangle-alert', color: 'error', duration: 0 })
    }
  }

  function refused(reason: TextRefusal, typed: string) {
    toast.add({
      title: t(reason === 'conflict' ? 'editor.typedText.changed' : 'editor.typedText.structure'),
      description: t('editor.typedText.copy'),
      icon: 'i-lucide-triangle-alert',
      color: 'warning',
      duration: 0,
      actions: [{ label: t('editor.typedText.copyText'), icon: 'i-lucide-copy', color: 'neutral', variant: 'outline', onClick: () => copy(typed) }],
    })
  }

  return { refused }
}
