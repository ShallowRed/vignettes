/** The shortcut that opens the suggestions of the editor, as the platform of the reader writes it: `⌘ ⇧ Espace`, `Ctrl ⇧ Espace`. */
export function useCompletionKeys() {
  const { getKbdKey } = useKbd()
  const { t } = useI18n()
  return computed(() => [getKbdKey('meta'), getKbdKey('shift'), t('editor.keys.space')].join(' '))
}
