// The DSFR illustrative colours (design tokens 1.13): the pale tint used as a
// background, the main tone for borders and icons, the deep tone for text.
export interface PaletteEntry {
  bg: string
  main: string
  text: string
}

export const DSFR_PALETTE: Record<string, PaletteEntry> = {
  'blue-france': { bg: '#f5f5fe', main: '#6a6af4', text: '#000091' },
  'blue-ecume': { bg: '#f4f6fe', main: '#465f9d', text: '#2f4077' },
  'blue-cumulus': { bg: '#f3f6fe', main: '#417dc4', text: '#3558a2' },
  'green-tilleul-verveine': { bg: '#fef7da', main: '#b7a73f', text: '#66673d' },
  'green-bourgeon': { bg: '#e6feda', main: '#68a532', text: '#447049' },
  'green-emeraude': { bg: '#e3fdeb', main: '#00a95f', text: '#297254' },
  'green-menthe': { bg: '#dffdf7', main: '#009081', text: '#37635f' },
  'green-archipel': { bg: '#e5fbfd', main: '#009099', text: '#006a6f' },
  'yellow-tournesol': { bg: '#fef6e3', main: '#c8aa39', text: '#716043' },
  'yellow-moutarde': { bg: '#fef5e8', main: '#c3992a', text: '#695240' },
  'orange-terre-battue': { bg: '#fef4f2', main: '#e4794a', text: '#755348' },
  'brown-cafe-creme': { bg: '#fbf6ed', main: '#d1b781', text: '#685c48' },
  'brown-caramel': { bg: '#fbf5f2', main: '#c08c65', text: '#845d48' },
  'brown-opera': { bg: '#fbf5f2', main: '#bd987a', text: '#745b47' },
  'beige-gris-galet': { bg: '#f9f6f2', main: '#aea397', text: '#6a6156' },
  'pink-macaron': { bg: '#fef4f2', main: '#e18b76', text: '#8d533e' },
  'pink-tuile': { bg: '#fef4f3', main: '#ce614a', text: '#a94645' },
  'purple-glycine': { bg: '#fef3fd', main: '#a558a0', text: '#6e445a' },
}

export type PaletteName = keyof typeof DSFR_PALETTE

export function paletteVars(name?: string): Record<string, string> | undefined {
  const entry = name ? DSFR_PALETTE[name] : undefined
  if (!entry)
    return undefined
  return { '--tone-bg': entry.bg, '--tone-main': entry.main, '--tone-text': entry.text }
}
