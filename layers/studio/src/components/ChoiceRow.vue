<script setup lang="ts">
import { btnActive, btnHover } from '../utils/toolbar-buttons'

// One value among several, as a row of buttons. With `iconOnly`, each button
// shows its icon and its label in a tooltip.
export interface Choice { label: string, value: string, active: boolean, icon?: string }

withDefaults(defineProps<{
  choices: readonly Choice[]
  iconOnly?: boolean
  size?: 'xs' | 'sm'
}>(), { size: 'xs' })

const emit = defineEmits<{ choose: [value: string] }>()
</script>

<template>
  <div class="flex flex-wrap gap-0.5 rounded-lg bg-elevated p-0.5">
    <UTooltip
      v-for="choice in choices"
      :key="choice.value"
      :text="choice.label"
      :disabled="!iconOnly"
    >
      <UButton
        color="neutral"
        variant="ghost"
        :size="size"
        class="flex-1 justify-center"
        :class="choice.active ? btnActive : btnHover"
        :aria-pressed="choice.active"
        :icon="choice.icon"
        :label="iconOnly ? undefined : choice.label"
        :aria-label="iconOnly ? choice.label : undefined"
        @click="emit('choose', choice.value)"
      />
    </UTooltip>
  </div>
</template>
