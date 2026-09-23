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
  /** Remix icon (`ri:shield-check-line`), sharper than a pictogram at the xs and sm sizes. */
  icon?: string
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
      :icon="icon"
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
  border: 1px solid var(--border, #e0e0e0);
}

/* An icon stays sharp at the tour's small sizes, where a pictogram's detail is
   lost; it takes a quarter more room than in a scheme card. */
.json-tour-zone :deep(.picto-card--row .picto-card__icon) {
  width: calc(var(--scheme-picto, 6em) * 0.75);
  height: calc(var(--scheme-picto, 6em) * 0.75);
  color: var(--accent, #000091);
}

/* The current zone turns its border to the accent and thickens it outward. */
.json-tour-zone.current-fragment :deep(.picto-card) {
  background: var(--accent-bg, #f5f5fe);
  border-color: var(--accent, #000091);
  box-shadow: 0 0 0 1px var(--accent, #000091);
}
</style>
