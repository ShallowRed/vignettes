<script setup lang="ts">
import type { BreadcrumbItem } from '@nuxt/ui'

// The brand mark, which leads to the home page, then the path to the page on
// screen; the name of the studio on the home page. Below the `lg` width the
// breadcrumb shows its last item only.
defineProps<{ items?: BreadcrumbItem[] }>()

const { t } = useI18n()
</script>

<template>
  <div class="flex items-center gap-2.5 min-w-0">
    <UTooltip :text="t('common.header.backHome')">
      <NuxtLink
        to="/"
        :aria-label="t('common.header.backHome')"
        class="grid place-items-center size-8 shrink-0 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
      >
        <VignettesMark class="w-5" />
      </NuxtLink>
    </UTooltip>
    <UBreadcrumb
      v-if="items?.length"
      :items="items"
      class="min-w-0"
      :ui="{ list: 'min-w-0', item: 'min-w-0 not-last:shrink-0 max-lg:not-last:hidden', separator: 'max-lg:hidden', link: 'min-w-0', linkLabel: 'truncate' }"
    />
    <span
      v-else
      class="text-highlighted font-bold"
    >Vignettes</span>
  </div>
</template>
