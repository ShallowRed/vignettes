<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { UI_THEME_NAMES, UI_THEMES } from '../../../../layers/studio/src/utils/ui-themes'

// The menu of the interface themes on trial, in the build made from staging
// only.
const uiTheme = useUiTheme()

const trialItems = computed<DropdownMenuItem[]>(() => UI_THEMES.map(id => ({
  label: UI_THEME_NAMES[id],
  type: 'checkbox' as const,
  checked: uiTheme.theme.value === id,
  onSelect: () => uiTheme.setTheme(id),
})))
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
