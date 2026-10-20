import type { PresentationListItem } from '#shared/presentations'
import type { DropdownMenuItem } from '@nuxt/ui'
import { catalogApi } from '../api'
import { requestErrorMessage } from '../utils/request-error'
import { saveTextFile } from '../utils/save-file'

/**
 * The menu entries that download the Markdown of a deck: the published version
 * for whoever may read it, the draft for whoever may edit it. The catalog cards
 * and the management table show them.
 */
export function useDeckDownload() {
  const { t } = useI18n()
  const toast = useToast()

  async function download(slug: string, version: 'published' | 'draft') {
    try {
      saveTextFile(`${slug}.md`, await catalogApi.deckMarkdown($fetch, slug, version), 'text/markdown')
    }
    catch (e) {
      toast.add({ title: requestErrorMessage(e, t('catalog.deck.downloadFailed')), icon: 'i-lucide-triangle-alert', color: 'error' })
    }
  }

  function downloadItems(item: PresentationListItem, canEdit: boolean): DropdownMenuItem[] {
    return [
      ...(item.published !== false
        ? [{ label: t('catalog.deck.downloadPublished'), icon: 'i-lucide-file-down', onSelect: () => download(item.slug, 'published') }]
        : []),
      ...(canEdit
        ? [{ label: t('catalog.deck.downloadDraft'), icon: 'i-lucide-file-pen-line', onSelect: () => download(item.slug, 'draft') }]
        : []),
    ]
  }

  return { downloadItems }
}
