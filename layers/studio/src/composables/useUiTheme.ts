import type { UiTheme } from '../utils/ui-themes'
import { resolveUiTheme, UI_THEME_COOKIE } from '../utils/ui-themes'
import { useTrial } from './useTrial'

/**
 * The interface theme. `NUXT_PUBLIC_UI_THEME` sets the theme of the instance;
 * where the `ui-themes` trial opens, a visitor tries another theme from the
 * menu. The choice is kept in a cookie so the server
 * renders the page with it.
 */
export function useUiTheme() {
  const trials = useTrial('ui-themes')
  const { uiTheme } = useRuntimeConfig().public
  const { name, ...options } = UI_THEME_COOKIE
  const themeChoice = useCookie<string | null>(name, options)

  return {
    trials,
    theme: computed(() => resolveUiTheme(uiTheme, themeChoice.value, trials.value)),
    setTheme: (id: UiTheme) => { themeChoice.value = id },
  }
}
