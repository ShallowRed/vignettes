import type { PresentationListItem } from '#shared/presentations'
import { deckPath } from '#shared/presentations'

/**
 * The address a person sends to open a deck, and its copy to the clipboard: the
 * management table, the sharing tab and the publication notice of the editor
 * offer it. It names the deck origin when the instance has one.
 */
export function useDeckLinks() {
  const { t } = useI18n()
  const toast = useToast()
  const { decksUrl } = useRuntimeConfig().public
  const originSide = useOriginSide()

  function deckUrl(item: Pick<PresentationListItem, 'alias' | 'slug'>): string {
    return new URL(deckPath(item), originSide.value === 'single' ? window.location.origin : decksUrl).href
  }

  async function copyLinks(items: Pick<PresentationListItem, 'alias' | 'slug'>[]) {
    const urls = items.map(deckUrl)
    await navigator.clipboard.writeText(urls.join('\n'))
    toast.add({
      title: t('catalog.table.linksCopied', urls.length),
      icon: 'i-lucide-clipboard-check',
      color: 'success',
    })
  }

  return { deckUrl, copyLinks }
}
