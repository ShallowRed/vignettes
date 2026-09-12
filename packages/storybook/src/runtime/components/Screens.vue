<script setup lang="ts">
import { computed } from 'vue'
// Responsive gallery laying out child media frames (typically <StoryFrame>) in an even row.
interface Props {
  /** Column count; defaults to an even auto-fit row. */
  cols?: string | number
  gap?: string
  align?: 'start' | 'center' | 'stretch'
}

const props = withDefaults(defineProps<Props>(), {
  align: 'stretch',
})

const columns = computed(() => {
  const n = typeof props.cols === 'string' ? Number.parseInt(props.cols, 10) : props.cols
  return n && Number.isFinite(n) && n > 0 ? n : undefined
})

const gridStyle = computed(() => ({
  gridTemplateColumns: columns.value
    ? `repeat(${columns.value}, minmax(0, 1fr))`
    : 'repeat(auto-fit, minmax(0, 1fr))',
  gap: props.gap || '1.5rem',
  alignItems: props.align,
}))
</script>

<template>
  <div
    class="screens"
    :style="gridStyle"
  >
    <slot />
  </div>
</template>

<style scoped>
.screens {
  display: grid;
  width: 100%;
  min-height: 0;
}

.screens :deep(.story-frame) {
  height: 100%;
}
</style>
