// The interface themes of the studio, each with its file in assets/css/themes/.
// vignettes.css sets the default values under `:root`; the others set the
// palettes, the radius and the typeface of Nuxt UI under
// `:root[data-ui-theme='<id>']`.
export const UI_THEMES = ['vignettes', 'dsfr', 'lasuite'] as const
export type UiTheme = typeof UI_THEMES[number]

export const UI_THEME_NAMES: Record<UiTheme, string> = {
  vignettes: 'Vignettes',
  dsfr: 'DSFR',
  lasuite: 'La Suite numérique',
}

function isUiTheme(id: unknown): id is UiTheme {
  return UI_THEMES.includes(id as UiTheme)
}

/** The theme of the instance, or the one a visitor chose where the trials are open. */
export function resolveUiTheme(instance: string, choice: unknown, trials: boolean): UiTheme {
  if (trials && isUiTheme(choice))
    return choice
  return isUiTheme(instance) ? instance : 'vignettes'
}
