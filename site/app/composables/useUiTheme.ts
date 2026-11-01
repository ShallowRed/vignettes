import type { UiTheme } from '../../../layers/studio/src/utils/ui-themes'
import { resolveUiTheme, UI_THEME_COOKIE } from '../../../layers/studio/src/utils/ui-themes'

/**
 * The interface theme on trial, as in the studio. The site is static, so the
 * choice is read in the browser; `NUXT_PUBLIC_UI_TRIALS` opens
 * the menu in the build made from staging.
 */
export function useUiTheme() {
  const trials = useRuntimeConfig().public.uiTrials === true
  const { name, ...options } = UI_THEME_COOKIE
  const themeChoice = useCookie<string | null>(name, options)

  return {
    trials,
    theme: computed(() => resolveUiTheme('vignettes', themeChoice.value, trials)),
    setTheme: (id: UiTheme) => { themeChoice.value = id },
  }
}
