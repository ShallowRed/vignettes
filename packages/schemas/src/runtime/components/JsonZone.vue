<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue'
import { JSON_TOUR } from '../injection-keys.ts'

// One described area of a `:::JsonTour`: a card whose fragment highlights the
// lines it names in the file beside it.
interface Props {
  /** Line range in the file, `12` or `12-24`. */
  lines?: string
  /** Area to highlight on the tour's image, `x,y,w,h` in percent. */
  spot?: string
  picto?: string
  title?: string
  n?: string | number
  /** Fragment step; defaults to the writing order. */
  step?: string | number
}

const props = defineProps<Props>()

const registry = inject(JSON_TOUR, null)
const el = ref<HTMLElement | null>(null)
const step = computed(() => (props.step === undefined || props.step === '' ? undefined : Number(props.step)))

onMounted(() => {
  if (el.value && registry)
    registry.registerZone({ el: el.value, lines: props.lines, spot: props.spot, step: step.value })
})
</script>

<template>
  <div
    ref="el"
    class="json-tour-zone"
  >
    <PictoCard
      :picto="picto"
      :title="title"
      :n="n"
      orientation="row"
    >
      <slot />
    </PictoCard>
  </div>
</template>

<style scoped>
.json-tour-zone + .json-tour-zone {
  margin-top: 0.5em;
}

.json-tour-zone :deep(.picto-card) {
  background: var(--surface, #fff);
  border: 1px solid #e5e5f4;
}

.json-tour-zone.current-fragment :deep(.picto-card) {
  background: var(--accent-bg, #f5f5fe);
  box-shadow: inset 0 0 0 2px var(--accent, #000091);
}
</style>
