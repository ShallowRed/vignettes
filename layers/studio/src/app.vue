<script setup lang="ts">
import * as uiLocales from '@nuxt/ui/locale'
import { useUiTheme } from './composables/useUiTheme'

const { locale, t } = useI18n()
const uiLocale = computed(() => uiLocales[locale.value])
const { instanceName, uiTheme } = useRuntimeConfig().public
const siteName = instanceName ? `Vignettes ${instanceName}` : 'Vignettes'
const { theme } = useUiTheme()
useHead({
  htmlAttrs: {
    'lang': locale,
    'data-ui-theme': () => theme.value === 'vignettes' ? undefined : theme.value,
  },
  titleTemplate: title => title ? `${title} · ${siteName}` : siteName,
})

// The link preview of every page; a deck page draws its own.
useSeoMeta({ ogSiteName: siteName })
defineOgImage('Studio', { description: t('common.og.description'), instanceName, fontFamily: UI_THEME_FONTS[resolveUiTheme(uiTheme, undefined, false)] })
</script>

<template>
  <UApp :locale="uiLocale">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
