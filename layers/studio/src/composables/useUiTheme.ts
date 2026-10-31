import type { UiTheme } from '../utils/ui-themes'
import { resolveUiTheme } from '../utils/ui-themes'

const ONE_YEAR = 60 * 60 * 24 * 365

/**
 * The interface theme. `NUXT_PUBLIC_UI_THEME` sets the theme of the instance;
 * where the acceptance kit opens (development and staging), a visitor tries
 * another theme from the menu. The choice is kept in a cookie so the server
 * renders the page with it.
 */
export function useUiTheme() {
  const trials = useState('ui-trials', () => useRequestEvent()?.context.uiTrials === true)
  const { uiTheme } = useRuntimeConfig().public
  const themeChoice = useCookie<string | null>('ui_theme', { maxAge: ONE_YEAR, sameSite: 'lax' })

  return {
    trials,
    theme: computed(() => resolveUiTheme(uiTheme, themeChoice.value, trials.value)),
    setTheme: (id: UiTheme) => { themeChoice.value = id },
  }
}
