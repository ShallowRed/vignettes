<script setup lang="ts">
import type { BreadcrumbItem } from '@nuxt/ui'

// A page that has a path from the home page gives it through `<NuxtLayout>`,
// so the server renders the header with it.
defineProps<{ breadcrumb?: BreadcrumbItem[] }>()
</script>

<template>
  <div class="tailwind-app min-h-dvh bg-muted">
    <AppHeader :breadcrumb="breadcrumb" />
    <UMain>
      <UContainer class="py-8">
        <slot />
      </UContainer>
    </UMain>
  </div>
</template>
