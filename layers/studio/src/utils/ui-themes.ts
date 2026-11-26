import { PREFERENCE_COOKIE } from './preference-cookie'

// The interface themes of the studio, each with its file in assets/css/themes/.
// vignettes.css sets the default values under `:root`; the others set the
// palettes, the radius and the typeface of Nuxt UI under
// `:root[data-ui-theme='<id>']`.
export const UI_THEMES = ['vignettes', 'dsfr', 'lasuite'] as const
export type UiTheme = typeof UI_THEMES[number]

/**
 * The typefaces of the interface themes that @nuxt/fonts serves, in the studio
 * and on the documentation site; the link preview images read them from it.
 * The local provider finds Marianne in the files of the dsfr deck theme, under
 * public/themes/dsfr/fonts/.
 */
export const UI_FONT_FAMILIES = [
  { name: 'Lexend Deca', provider: 'google', global: true, weights: [400, 500, 600, 700] },
  { name: 'Marianne', provider: 'local', global: true, weights: [400, 500, 700] },
]

/** The typeface of each theme in the link preview images, which read no CSS. */
export const UI_THEME_FONTS: Record<UiTheme, string> = {
  vignettes: 'Lexend Deca',
  dsfr: 'Marianne',
  lasuite: 'Marianne',
}

const UI_THEME_NAMES: Record<UiTheme, string> = {
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

/** The cookie that keeps the theme a visitor tries, read by the server of the studio and by the head script of the site. */
export const UI_THEME_COOKIE = { name: 'ui_theme', ...PREFERENCE_COOKIE } as const

/** The entries of the menu of the themes on trial. */
export function uiThemeMenuItems(current: UiTheme, select: (id: UiTheme) => void) {
  return UI_THEMES.map(id => ({ label: UI_THEME_NAMES[id], type: 'checkbox' as const, checked: current === id, onSelect: () => select(id) }))
}
