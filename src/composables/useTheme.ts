import type { Ref } from 'vue'
import { resolveThemeName } from '#shared/theme'

export function useTheme(themeName: Ref<string> | string) {
  let themeLink: HTMLLinkElement | null = null

  function loadTheme(theme: string) {
    if (themeLink?.parentNode) {
      themeLink.parentNode.removeChild(themeLink)
    }

    themeLink = document.createElement('link')
    themeLink.rel = 'stylesheet'
    themeLink.href = `/themes/${resolveThemeName(theme)}.css`
    document.head.appendChild(themeLink)
  }

  function unloadTheme() {
    if (themeLink?.parentNode) {
      themeLink.parentNode.removeChild(themeLink)
      themeLink = null
    }
  }

  function watchTheme() {
    if (isRef(themeName)) {
      watch(themeName, (newTheme: string) => {
        if (newTheme)
          loadTheme(newTheme)
      })
    }
  }

  return {
    loadTheme,
    unloadTheme,
    watchTheme,
  }
}
