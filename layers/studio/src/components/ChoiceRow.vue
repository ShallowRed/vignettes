<script setup lang="ts">
import { btnActive, btnHover } from '../utils/toolbar-buttons'

// One value among several, as a row of buttons. With `iconOnly`, each button
// shows its icon and its label in a tooltip. A choice with a note shows a mark,
// the note in a tooltip, and a screen reader reads it after the label.
export interface ChoiceNote { text: string, severity: 'warning' | 'info' }
export interface Choice { label: string, value: string, active: boolean, icon?: string, note?: ChoiceNote }

withDefaults(defineProps<{
  choices: readonly Choice[]
  iconOnly?: boolean
  /** The choices may receive a note: each button keeps the place of its mark. */
  marks?: boolean
  size?: 'xs' | 'sm'
}>(), { size: 'xs' })

const emit = defineEmits<{ choose: [value: string] }>()

const NOTE_MARKS: Record<ChoiceNote['severity'], { icon: string, color: string }> = {
  warning: { icon: 'i-lucide-triangle-alert', color: 'text-warning' },
  info: { icon: 'i-lucide-a-arrow-down', color: 'text-muted' },
}
</script>

<template>
  <div class="flex flex-wrap gap-0.5 rounded-lg bg-elevated p-0.5">
    <UTooltip
      v-for="choice in choices"
      :key="choice.value"
      :text="[iconOnly ? choice.label : '', choice.note?.text].filter(Boolean).join('. ')"
      :disabled="!iconOnly && !choice.note"
    >
      <UButton
        color="neutral"
        variant="ghost"
        :size="size"
        class="flex-1 justify-center"
        :class="choice.active ? btnActive : btnHover"
        :aria-pressed="choice.active"
        :icon="choice.icon"
        :trailing-icon="choice.note ? NOTE_MARKS[choice.note.severity].icon : marks ? NOTE_MARKS.warning.icon : undefined"
        :ui="{ trailingIcon: choice.note ? NOTE_MARKS[choice.note.severity].color : 'invisible' }"
        :label="iconOnly ? undefined : choice.label"
        :aria-label="iconOnly || choice.note ? [choice.label, choice.note?.text].filter(Boolean).join('. ') : undefined"
        @click="emit('choose', choice.value)"
      />
    </UTooltip>
  </div>
</template>
