import type { PresentationListItem } from '#shared/presentations'
import type { DropdownMenuItem } from '@nuxt/ui'
import { isFrozen } from '#shared/presentations'
import { catalogApi } from '../api'
import { requestErrorMessage } from '../utils/request-error'
import { saveTextFile } from '../utils/save-file'

/** The events of a deck's menu, which the catalog page handles. */
export interface DeckActionEvents {
  (event: 'editMeta', deck: PresentationListItem): void
  (event: 'share', deck: PresentationListItem): void
  (event: 'duplicate', deck: PresentationListItem, mode: 'variant' | 'edition'): void
  (event: 'remove', deck: PresentationListItem): void
}

/**
 * The entries of a deck's menu, in groups that the catalog card and the
 * management table arrange. `admin` adds the management entries (privileged
 * roles), which a frozen deck does not take; the share entry follows the deck's
 * own `canShare`, and the draft download its `canEdit`.
 */
export function useDeckActions(emit: DeckActionEvents) {
  const { t } = useI18n()
  const toast = useToast()

  async function download(slug: string, version: 'published' | 'draft') {
    try {
      saveTextFile(version === 'draft' ? t('catalog.deck.draftFileName', { slug }) : `${slug}.md`, await catalogApi.deckMarkdown($fetch, slug, version), 'text/markdown')
    }
    catch (e) {
      toast.add({ title: requestErrorMessage(e, t('catalog.deck.downloadFailed')), icon: 'i-lucide-triangle-alert', color: 'error' })
    }
  }

  function deckActions(item: PresentationListItem, admin: boolean) {
    const manages = admin && !isFrozen(item)
    const share: DropdownMenuItem[] = item.canShare && !isFrozen(item)
      ? [{ label: t('catalog.deck.share'), icon: 'i-lucide-users', onSelect: () => emit('share', item) }]
      : []
    return {
      manage: manages
        ? [
            { label: t('common.actions.edit'), icon: 'i-lucide-pencil', to: `/edit/${item.slug}` },
            { label: t('catalog.deck.metadata'), icon: 'i-lucide-settings-2', onSelect: () => emit('editMeta', item) },
            ...share,
          ]
        : share,
      downloads: [
        ...(item.published !== false
          ? [{ label: t('catalog.deck.downloadPublished'), icon: 'i-lucide-file-down', onSelect: () => download(item.slug, 'published') }]
          : []),
        ...(item.canEdit
          ? [{ label: t('catalog.deck.downloadDraft'), icon: 'i-lucide-file-pen-line', onSelect: () => download(item.slug, 'draft') }]
          : []),
      ] satisfies DropdownMenuItem[],
      family: manages
        ? [
            { label: t('catalog.deck.createVariant'), icon: 'i-lucide-languages', onSelect: () => emit('duplicate', item, 'variant') },
            { label: t('catalog.deck.newEdition'), icon: 'i-lucide-copy-plus', onSelect: () => emit('duplicate', item, 'edition') },
          ]
        : [],
      trash: manages
        ? [{ label: t('catalog.deck.delete'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => emit('remove', item) }]
        : [],
    } satisfies Record<string, DropdownMenuItem[]>
  }

  return { deckActions }
}
