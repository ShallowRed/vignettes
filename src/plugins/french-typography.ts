import { vFrenchTypography } from '~/directives/french-typography'

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.directive('french-typography', vFrenchTypography)
})
