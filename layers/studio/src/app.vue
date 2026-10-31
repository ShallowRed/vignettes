<script setup lang="ts">
import * as uiLocales from '@nuxt/ui/locale'

const { locale, t } = useI18n()
const uiLocale = computed(() => uiLocales[locale.value])
useHead({ htmlAttrs: { lang: locale } })

// The link preview of every page; a deck page draws its own.
useSeoMeta({ ogSiteName: 'Vignettes' })
defineOgImage('Studio', { description: t('common.og.description') })
</script>

<template>
  <UApp :locale="uiLocale">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
