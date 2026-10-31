<script setup lang="ts">
import * as uiLocales from '@nuxt/ui/locale'

const { locale, t } = useI18n()
const uiLocale = computed(() => uiLocales[locale.value])
const { instanceName } = useRuntimeConfig().public
const siteName = instanceName ? `Vignettes ${instanceName}` : 'Vignettes'
useHead({
  htmlAttrs: { lang: locale },
  titleTemplate: title => title ? `${title} · ${siteName}` : siteName,
})

// The link preview of every page; a deck page draws its own.
useSeoMeta({ ogSiteName: siteName })
defineOgImage('Studio', { description: t('common.og.description'), instanceName })
</script>

<template>
  <UApp :locale="uiLocale">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
