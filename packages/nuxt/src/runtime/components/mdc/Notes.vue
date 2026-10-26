<script setup lang="ts">
// Speaker notes: hidden in the deck, shown in Reveal's speaker view (key S).

defineSlots<{
  /** The notes, in markdown. */
  default?: () => unknown
}>()
</script>

<template>
  <aside class="notes">
    <slot />
  </aside>
</template>
