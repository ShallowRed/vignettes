<script setup lang="ts">
import type { LegendMark } from '../legend.ts'
import { computed } from 'vue'
import { parseLegend } from '../legend.ts'
import { paletteVars } from '../palette.ts'

// The key of the codes a `:::Diagram` or a `:::Sequence` uses, under it. Divs
// with ARIA list roles, so the ul and li styles of a theme (bullets, indents)
// do not apply. The lines and the planned card read the custom properties of
// the diagram or the sequence around it.
const props = defineProps<{ entries?: string, marks?: readonly LegendMark[] }>()

const items = computed(() => parseLegend(props.entries, props.marks))
</script>

<template>
  <div
    v-if="items.length"
    class="schema-legend"
    role="list"
  >
    <div
      v-for="(item, index) in items"
      :key="index"
      class="schema-legend__item"
      role="listitem"
    >
      <svg
        v-if="'mark' in item && (item.mark === 'solid' || item.mark === 'dashed')"
        class="schema-legend__line"
        :class="{ 'schema-legend__line--dashed': item.mark === 'dashed' }"
        viewBox="0 0 30 10"
        aria-hidden="true"
      >
        <path d="M 0 5 H 23" />
        <path
          class="schema-legend__head"
          d="M 22 1 L 30 5 L 22 9 z"
        />
      </svg>
      <span
        v-else
        class="schema-legend__swatch"
        :class="'mark' in item ? `schema-legend__swatch--${item.mark}` : 'schema-legend__swatch--color'"
        :style="'color' in item ? paletteVars(item.color) : undefined"
        aria-hidden="true"
      />
      {{ item.text }}
    </div>
  </div>
</template>

<style scoped>
.schema-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3em 1.4em;
  margin-top: 0.9em;
  font-size: 0.8em;
  color: var(--text-mention);
}

.schema-legend__item {
  display: flex;
  align-items: center;
  gap: 0.5em;
}

.schema-legend__line {
  width: 2.2em;
  height: 0.75em;
  color: var(--accent);
}

.schema-legend__line path {
  vector-effect: non-scaling-stroke;
  fill: none;
  stroke: currentColor;
  stroke-width: var(--schema-stroke);
}

.schema-legend__line--dashed path:first-child {
  stroke-dasharray: var(--schema-dash);
}

.schema-legend__line .schema-legend__head {
  fill: currentColor;
  stroke: none;
}

.schema-legend__swatch {
  width: 1.1em;
  height: 0.8em;
  border-radius: 2px;
  border: 1px solid var(--accent-line);
  background: var(--surface);
}

.schema-legend__swatch--planned {
  border: var(--schema-planned);
}

.schema-legend__swatch--flow {
  width: 1.6em;
  border: none;
  border-radius: 999px;
  background: var(--accent-soft);
}

.schema-legend__swatch--emphasis {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.schema-legend__swatch--color {
  border-color: var(--tone-main, var(--accent));
  background: var(--tone-bg, var(--accent-bg));
}
</style>
