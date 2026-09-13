import type { MaybeRefOrGetter } from 'vue'
import { resolveThemeName } from '@vignettes/core/theme'
import { computed, toValue } from 'vue'

const THEME_LINK_SELECTOR = 'link[data-deck-theme]'

/**
 * Links the deck theme stylesheet from the document head. The link is part of
 * the server-rendered HTML, so the browser applies the theme before the first
 * paint. The link follows the theme when it changes and leaves the head with the
 * component.
 */
export function useTheme(themeName: MaybeRefOrGetter<string>) {
  const href = computed(() => `/themes/${resolveThemeName(toValue(themeName))}.css`)

  useHead({
    link: [computed(() => ({
      'key': 'deck-theme',
      'rel': 'stylesheet',
      'href': href.value,
      'data-deck-theme': '',
      'tagPriority': 'low' as const,
    }))],
  })

  /**
   * Resolves once the current theme stylesheet is applied, or has failed to
   * load. After a client-side navigation the head receives the link after the
   * component has mounted, so the head is observed until the link appears.
   */
  function themeReady(): Promise<void> {
    return new Promise((resolve) => {
      const expected = new URL(href.value, document.baseURI).href
      const findLink = () => [...document.querySelectorAll<HTMLLinkElement>(THEME_LINK_SELECTOR)]
        .find(link => link.href === expected)

      const waitFor = (link: HTMLLinkElement) => {
        if (link.sheet?.href === expected)
          return resolve()
        link.addEventListener('load', () => resolve(), { once: true })
        link.addEventListener('error', () => resolve(), { once: true })
      }

      const link = findLink()
      if (link)
        return waitFor(link)
      const observer = new MutationObserver(() => {
        const inserted = findLink()
        if (!inserted)
          return
        observer.disconnect()
        waitFor(inserted)
      })
      observer.observe(document.head, { childList: true, subtree: true, attributeFilter: ['href'] })
    })
  }

  return { themeReady }
}
