import type { DropdownMenuItem } from '@nuxt/ui'

/**
 * The owner's menu of a folder: edit it, manage its access, delete it. The folder
 * cards of the home page and the folder page show it.
 */
export function useProjectActions() {
  const { t } = useI18n()

  return (on: { edit: () => void, manageAccess: () => void, remove: () => void }): DropdownMenuItem[][] => [
    [
      { label: t('catalog.folders.edit'), icon: 'i-lucide-pencil', onSelect: on.edit },
      { label: t('catalog.folders.manageAccess'), icon: 'i-lucide-users', onSelect: on.manageAccess },
    ],
    [
      { label: t('catalog.folders.delete'), icon: 'i-lucide-trash-2', color: 'error', onSelect: on.remove },
    ],
  ]
}
