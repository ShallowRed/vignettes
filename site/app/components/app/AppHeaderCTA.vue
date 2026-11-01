<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { uiThemeMenuItems } from '../../../../layers/studio/src/utils/ui-themes'

// The menu of the interface themes on trial, in the build made from staging
// only.
const uiTheme = useUiTheme()

const trialItems = computed<DropdownMenuItem[]>(() => uiThemeMenuItems(uiTheme.theme.value, uiTheme.setTheme))
</script>

<template>
  <UButton
    to="/docs"
    label="Documentation"
    color="neutral"
    variant="ghost"
    class="hidden sm:inline-flex"
  />
  <ClientOnly v-if="uiTheme.trials">
    <UDropdownMenu :items="trialItems">
      <UButton
        icon="i-lucide-palette"
        color="neutral"
        variant="ghost"
        aria-label="Thème d'interface"
      />
    </UDropdownMenu>
  </ClientOnly>
</template>
