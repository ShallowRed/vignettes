<script setup lang="ts">
import { inject } from 'vue'
import { SCHEME_ARROWS, SCHEME_FRAGMENTS, SCHEME_TILES } from '../injection-keys.ts'

// One card of a `:::Scheme`, preceded by an arrow after the first one.
interface Props {
  /** Pictogram, as its path under `/pictograms` without the extension: `digital/coding`. */
  picto?: string
  /** Remix icon, `ri:server-line`, lighter than a pictogram. */
  icon?: string
  /** Title of the step. */
  title?: string
  /** Step number shown in a badge. */
  n?: string | number
}

defineProps<Props>()

defineSlots<{
  /** The caption, in markdown. */
  default?: () => unknown
}>()

const asFragment = inject(SCHEME_FRAGMENTS, true)
const withArrow = inject(SCHEME_ARROWS, true)
const orientation = inject(SCHEME_TILES, 'column')
</script>

<template>
  <div
    class="scheme-step"
    :class="{ fragment: asFragment }"
  >
    <span
      v-if="withArrow"
      class="scheme-step__arrow"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        width="1em"
        height="1em"
      >
        <path
          fill="currentColor"
          d="M13.2 5.3 19.9 12l-6.7 6.7-1.4-1.4 4.3-4.3H4v-2h12.1l-4.3-4.3z"
        />
      </svg>
    </span>
    <PictoCard
      class="scheme-step__card"
      :picto="picto"
      :icon="icon"
      :title="title"
      :n="n"
      :orientation="orientation"
    >
      <slot />
    </PictoCard>
  </div>
</template>

<style scoped>
/* The cards stretch to the tallest one, so their tops and pictograms align. */
.scheme-step {
  display: flex;
  align-items: stretch;
  flex: 1 1 0;
  min-width: 0;
}

.scheme-step:first-child .scheme-step__arrow {
  display: none;
}

.scheme-step__arrow {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  align-self: center;
  width: 2.2em;
  font-size: 1.6em;
  color: var(--accent);
}

.scheme-step__card {
  flex: 1 1 0;
  min-width: 0;
}
</style>
