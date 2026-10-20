<script setup lang="ts">
import type { DeckGrant } from '#shared/access'
import type { SelectItem } from '@nuxt/ui'

/**
 * The terms of a new grant, its access level and its duration, followed by the
 * button that submits it (default slot). The duration stays empty until its
 * choices are known.
 */
defineProps<{ roleItems: SelectItem[], durationItems: SelectItem[], disabled?: boolean }>()

const role = defineModel<DeckGrant>('role', { required: true })
const days = defineModel<number | undefined>('days', { required: true })

const { t } = useI18n()
</script>

<template>
  <div class="flex items-center gap-2">
    <USelect
      v-model="role"
      :items="roleItems"
      :disabled="disabled"
      class="w-28 shrink-0"
      :aria-label="t('deck.grantForm.accessLevel')"
    />
    <USelect
      v-model="days"
      :items="durationItems"
      :disabled="disabled"
      :placeholder="t('deck.grantForm.durationPending')"
      class="min-w-0 flex-1"
      :aria-label="t('deck.grantForm.accessDuration')"
    />
    <slot />
  </div>
</template>
