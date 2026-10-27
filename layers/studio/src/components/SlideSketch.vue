<script setup lang="ts">
import type { SketchShape } from '../config/editor-reference'
import { SKETCH_FRAME } from '../config/editor-reference'

// The sketch of a slide: its frame, and the title, texts and media of a layout.
defineProps<{
  shapes: readonly SketchShape[]
}>()

const FILLS: Record<SketchShape['kind'], string> = {
  title: 'fill-(--ui-text-toned)',
  text: 'fill-(--ui-text-muted)',
  media: 'fill-primary/30',
  band: 'fill-primary/15',
  card: 'fill-(--ui-bg)',
}
</script>

<template>
  <svg
    :viewBox="`0 0 ${SKETCH_FRAME.width} ${SKETCH_FRAME.height}`"
    aria-hidden="true"
  >
    <rect
      x="0.5"
      y="0.5"
      :width="SKETCH_FRAME.width - 1"
      :height="SKETCH_FRAME.height - 1"
      rx="3"
      class="fill-(--ui-bg) stroke-(--ui-border-accented)"
    />
    <rect
      v-for="(shape, index) in shapes"
      :key="index"
      :x="shape.x"
      :y="shape.y"
      :width="shape.width"
      :height="shape.height"
      :rx="Math.min(1.5, shape.height / 2)"
      :class="FILLS[shape.kind]"
    />
  </svg>
</template>
