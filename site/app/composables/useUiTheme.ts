import type { UiTheme } from '../../../layers/studio/src/utils/ui-themes'
import { resolveUiTheme } from '../../../layers/studio/src/utils/ui-themes'

const ONE_YEAR = 60 * 60 * 24 * 365

/**
 * The interface theme on trial, as in the studio. The site is
 * static, so the choice is read in the browser; `NUXT_PUBLIC_UI_TRIALS` opens
 * the menu in the build made from staging.
 */
export function useUiTheme() {
  const trials = useRuntimeConfig().public.uiTrials === true
  const themeChoice = useCookie<string | null>('ui_theme', { maxAge: ONE_YEAR, sameSite: 'lax' })

  return {
    trials,
    theme: computed(() => resolveUiTheme('vignettes', themeChoice.value, trials)),
    setTheme: (id: UiTheme) => { themeChoice.value = id },
  }
}
