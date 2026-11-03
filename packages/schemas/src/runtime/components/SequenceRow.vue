<script setup lang="ts">
import { computed, inject, onBeforeUnmount } from 'vue'
import { SEQUENCE } from '../injection-keys.ts'
import { paletteVars } from '../palette.ts'

// One row of a `:::Sequence`, shared by `::Message`, `::State` and `::Remark`:
// it takes the next free row of the grid, in the order of the page, draws the
// rule above it and writes the heading in the left margin. The cells it holds
// are revealed together.
interface Props {
  /** Text of the left margin: a time, or the name of a state. */
  heading?: string
  /** `time` sets the heading in the running text; `name` in small capitals. */
  headingKind?: 'time' | 'name'
  /** Fragment index of the row; defaults to the reading order. */
  step?: string | number
  /** Tint of the row: a palette name of the theme or a color. */
  color?: string
  /** Tints the whole row with `color`, for a row the slide is about. */
  band?: boolean
  /** Ids of the participants the row names, for their entry. */
  actors?: readonly string[]
}

const props = withDefaults(defineProps<Props>(), {
  headingKind: 'time',
})

defineSlots<{
  default?: () => unknown
}>()

const registry = inject(SEQUENCE, null)
registry?.registerRow()
onBeforeUnmount(() => registry?.unregisterRow())

const tone = computed(() => paletteVars(props.color))
</script>

<template>
  <div
    class="sequence-row"
    :class="{ 'sequence-row--toned': !!tone }"
    :style="tone"
    :data-step="step === undefined || step === '' ? undefined : String(step)"
    :data-actors="actors?.join(',')"
  >
    <div
      v-if="band"
      class="sequence__cell sequence-row__band"
      aria-hidden="true"
    />
    <div
      v-if="heading"
      class="sequence__cell sequence-row__heading"
      :class="`sequence-row__heading--${headingKind}`"
    >
      {{ heading }}
    </div>
    <slot />
  </div>
</template>

<style scoped>
.sequence-row {
  position: relative;
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: subgrid;
  grid-template-rows: minmax(3em, auto);
  align-items: center;
  border-top: 1px solid color-mix(in srgb, var(--border) 50%, var(--surface));
}

.sequence-row:not(:has(~ .sequence-row)) {
  border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, var(--surface));
}

.sequence-row > :deep(*) {
  grid-row: 1;
  position: relative;
  z-index: 1;
}

.sequence-row > .sequence-row__band {
  grid-column: 1 / -1;
  align-self: stretch;
  z-index: 0;
  margin-left: -0.7em;
  background: var(--tone-bg, var(--accent-bg));
  box-shadow: inset 3px 0 0 var(--tone-main, var(--accent));
}

.sequence-row__heading {
  grid-column: 1;
  padding-right: 1.4em;
  white-space: nowrap;
}

.sequence-row__heading--time {
  color: var(--text-title);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.sequence-row__heading--name {
  color: var(--text-mention);
  font-size: 0.85em;
  font-weight: 700;
  letter-spacing: 0.03em;
}

.sequence-row--toned .sequence-row__heading {
  color: var(--tone-text);
}
</style>
