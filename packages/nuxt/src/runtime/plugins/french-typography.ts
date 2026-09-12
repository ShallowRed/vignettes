import { defineNuxtPlugin } from '#imports'
import { vFrenchTypography } from '@vignettes/typographie'

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.directive('french-typography', vFrenchTypography)
})
