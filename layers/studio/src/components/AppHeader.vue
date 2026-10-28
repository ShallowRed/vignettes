<script setup lang="ts">
import type { BreadcrumbItem } from '@nuxt/ui'

// App chrome: the brand and the path to the page on the left, the account menu
// on the right.
defineProps<{ breadcrumb?: BreadcrumbItem[] }>()
</script>

<template>
  <UHeader
    :toggle="false"
    :ui="{ left: 'min-w-0' }"
  >
    <template #left>
      <AppTitle :items="breadcrumb" />
    </template>

    <template #right>
      <AccountMenu />
    </template>
  </UHeader>
</template>
