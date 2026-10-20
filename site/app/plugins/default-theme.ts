import { setDefaultTheme } from '@vignettes/core/theme'

// A deck that names no theme takes dsfr, the default theme of the studio.
export default defineNuxtPlugin(() => {
  setDefaultTheme('dsfr')
})
