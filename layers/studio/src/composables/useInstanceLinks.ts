/**
 * The links an instance sets for its users, from `NUXT_PUBLIC_HELP_URL` and
 * `NUXT_PUBLIC_FEEDBACK_URL`: its documentation and where to send feedback.
 * The header and the status bar of the editor show the ones that have an address.
 */
export function useInstanceLinks() {
  const { t } = useI18n()
  const { helpUrl, feedbackUrl } = useRuntimeConfig().public
  return computed(() => [
    { url: helpUrl, label: t('common.header.documentation'), icon: 'i-lucide-book-open' },
    { url: feedbackUrl, label: t('common.header.feedback'), icon: 'i-lucide-message-square' },
  ].filter(link => link.url))
}
