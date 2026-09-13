<script setup lang="ts">
import { normalizeIconName } from '@vignettes/core/deck'
import { computed } from 'vue'
import { paletteVars } from '../palette.ts'

// A named region of a `:::Diagram` grid: the machine, or the party, that the
// cards inside it run on. Drawn behind the cards, so edges crossing it read as
// data leaving one machine for another.
interface Props {
  /** Grid cell the region starts at, `col,row` (1-based). */
  at?: string
  /** Cells spanned as `cols,rows`. */
  span?: string
  title?: string
  /** DSFR pictogram, path under /pictograms. */
  picto?: string
  /** Remix icon (`ri:server-line`), lighter than a pictogram on a dense diagram. */
  icon?: string
  /** `subject` tints the region that the story follows; `neutral` is the default. */
  tone?: 'neutral' | 'subject'
  /** A DSFR illustrative colour, `green-emeraude`, `purple-glycine`…; tints and outlines the region. */
  color?: string
  /** Where the title sits: on the top border like a legend, or as a header band inside. */
  label?: 'legend' | 'header'
}

const props = defineProps<Props>()

const pictoSrc = computed(() => (props.picto ? `/pictograms/${props.picto}.svg` : undefined))
const iconName = computed(() => (props.icon ? normalizeIconName(props.icon) : undefined))

const style = computed(() => {
  const s: Record<string, string> = { ...paletteVars(props.color) }
  if (props.at) {
    const [col, row] = props.at.split(',').map(v => Number.parseInt(v.trim(), 10))
    const [sc, sr] = (props.span ?? '1,1').split(',').map(v => Number.parseInt(v.trim(), 10) || 1)
    if (col)
      s.gridColumn = `${col} / span ${sc}`
    if (row)
      s.gridRow = `${row} / span ${sr}`
  }
  return s
})
</script>

<template>
  <div
    class="diagram-area"
    :class="[
      `diagram-area--${tone ?? 'neutral'}`,
      `diagram-area--${label ?? 'legend'}`,
      { 'diagram-area--colored': !!color },
    ]"
    :style="style"
  >
    <p
      v-if="title"
      class="diagram-area__label"
    >
      <img
        v-if="pictoSrc"
        class="diagram-area__picto"
        :src="pictoSrc"
        alt=""
      >
      <Icon
        v-else-if="iconName"
        :name="iconName"
        class="diagram-area__icon"
        mode="svg"
      />
      {{ title }}
    </p>
  </div>
</template>

<style scoped>
/* The region sits on the same cells as the cards it holds, pushed out a little
   so they breathe inside it, and behind them so the arrows stay readable. The
   grid centres its items, so the region has to claim its cells' full size. */
.diagram-area {
  --tone-bg: rgb(255 255 255 / 45%);
  --tone-main: #c6c6d6;
  --tone-text: var(--text-default, #3a3a3a);
  position: relative;
  align-self: stretch;
  justify-self: stretch;
  margin: -0.6em -0.9em;
  border: 1px dashed var(--tone-main);
  border-radius: 10px;
  pointer-events: none;
}

.diagram-area--header,
.diagram-area--subject,
.diagram-area--colored {
  background: var(--tone-bg);
  border-style: solid;
}

.diagram-area--subject {
  --tone-bg: rgb(232 232 254 / 45%);
  --tone-main: #b1b1f7;
}

/* The label interrupts the top border, the way a fieldset legend does. The
   region itself stays under the cards; its label rides above them, since a
   card in the first row of the region would otherwise cover it. */
.diagram-area__label {
  position: absolute;
  z-index: 2;
  top: 0;
  left: 1.1em;
  transform: translateY(-52%);
  display: flex;
  gap: 0.35em;
  align-items: center;
  margin: 0;
  padding: 0 0.5em;
  background: var(--surface-page, #f7f7fc);
  color: var(--tone-text);
  font-size: 0.8em;
  font-weight: 700;
  letter-spacing: 0.01em;
  white-space: nowrap;
}

/* A header band: the region reaches up to hold its title above the cards. */
.diagram-area--header {
  margin-top: -2.8em;
}

.diagram-area--header .diagram-area__label {
  top: 0.45em;
  left: 0;
  right: 0;
  justify-content: center;
  transform: none;
  background: none;
  font-size: 1em;
}

.diagram-area__picto {
  flex: 0 0 auto;
  width: 1.2em;
  height: 1.2em;
  object-fit: contain;
}

.diagram-area__icon {
  flex: 0 0 auto;
  width: 1.1em;
  height: 1.1em;
  color: var(--tone-text);
}
</style>
