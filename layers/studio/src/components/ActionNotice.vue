<script setup lang="ts">
/**
 * The notice before an action with consequences: a neutral card whose icon and
 * light border carry the tone, so the text stays readable. `warn` for an action
 * that can be undone or only replaces a draft, `critical` for a permanent one.
 * The actions go in the default slot.
 */
const props = withDefaults(defineProps<{
  tone?: 'warn' | 'critical'
  title: string
  description?: string
  icon?: string
}>(), { tone: 'warn' })

const TONES = {
  warn: { icon: 'i-lucide-triangle-alert', text: 'text-warning', border: 'border-warning/40' },
  critical: { icon: 'i-lucide-octagon-alert', text: 'text-error', border: 'border-error/40' },
} as const

const tone = computed(() => TONES[props.tone])
</script>

<template>
  <div
    class="flex gap-3 rounded-lg border bg-elevated/60 px-4 py-3"
    :class="tone.border"
    role="alert"
  >
    <UIcon
      :name="icon ?? tone.icon"
      class="mt-0.5 size-5 shrink-0"
      :class="tone.text"
    />
    <div class="min-w-0 flex-1">
      <p class="text-sm font-medium text-highlighted">
        {{ title }}
      </p>
      <p
        v-if="description"
        class="mt-0.5 text-sm text-muted"
      >
        {{ description }}
      </p>
      <div
        v-if="$slots.default"
        class="mt-3 flex flex-wrap gap-2"
      >
        <slot />
      </div>
    </div>
  </div>
</template>
