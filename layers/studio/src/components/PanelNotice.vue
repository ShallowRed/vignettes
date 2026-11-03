<script setup lang="ts">
// A line of a toolbar panel with a message; the action it offers goes in the
// default slot.
defineProps<{
  text: string
  /** A status, shown in a quieter tone. */
  muted?: boolean
}>()
</script>

<template>
  <div
    class="flex items-center gap-2 rounded-md bg-elevated p-2 text-xs"
    :class="{ 'text-muted': muted }"
  >
    <span class="flex-1">{{ text }}</span>
    <slot />
  </div>
</template>
