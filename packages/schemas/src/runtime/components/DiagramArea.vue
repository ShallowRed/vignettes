<script setup lang="ts">
import { normalizeIconName } from '@vignettes/core/deck'
import { computed } from 'vue'
import { paletteVars } from '../palette.ts'

// A named region of a `:::Diagram` grid: the machine, or the party, that the
// cards inside it run on. Drawn behind the cards, so edges crossing it read as
// data leaving one machine for another.
interface Props {
  /**
   * Grid cell the region starts at, `col,row` (1-based).
   * @fr Case de la grille où commence la zone, `colonne,rangée` en partant de 1.
   */
  at?: string
  /**
   * Cells spanned as `cols,rows`.
   * @fr Cases occupées, `colonnes,rangées`.
   */
  span?: string
  /**
   * Name of the region.
   * @fr Nom de la zone.
   */
  title?: string
  /**
   * Pictogram, as its path under `/pictograms` without the extension: `digital/coding`.
   * @symbol pictogram
   * @fr Pictogramme, par son chemin sous `/pictograms` sans l'extension : `digital/coding`.
   */
  picto?: string
  /**
   * Remix icon (`ri:server-line`), lighter than a pictogram on a dense diagram.
   * @symbol icon
   * @fr Icône Remix (`ri:server-line`), plus légère qu'un pictogramme dans un diagramme chargé.
   */
  icon?: string
  /**
   * `subject` tints the region the slide is about; `neutral` is the default.
   * @fr `subject` teinte la zone dont parle la diapositive ; `neutral` par défaut.
   */
  tone?: 'neutral' | 'subject'
  /**
   * Color of the title, the surface and the outline of the region: a palette name of the theme, such as `green`, or a hexadecimal color or a color function, such as `#2a7f62`.
   * @fr Couleur du titre, du fond et du contour de la zone : un nom de la palette du thème, comme `green`, ou une couleur hexadécimale ou une fonction de couleur, comme `#2a7f62`.
   */
  color?: string
  /**
   * Where the title sits: on the top border like a legend, or as a header band inside.
   * @fr Place du titre : sur la bordure du haut comme une légende, ou dans un bandeau en tête de la zone.
   */
  label?: 'legend' | 'header'
}

const props = defineProps<Props>()

const pictoSrc = computed(() => (props.picto ? `/pictograms/${props.picto}.svg` : undefined))
const iconName = computed(() => (props.icon ? normalizeIconName(props.icon) : undefined))

const tint = computed(() => paletteVars(props.color))

const style = computed(() => {
  const s: Record<string, string> = { ...tint.value }
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
      { 'diagram-area--colored': !!tint },
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
  --tone-main: color-mix(in srgb, var(--text-mention) 40%, var(--surface));
  --tone-text: var(--on-surface-default);
  position: relative;
  align-self: stretch;
  justify-self: stretch;
  margin: -0.6em -0.9em;
  border: 1px dashed var(--tone-main);
  border-radius: var(--radius, 6px);
  pointer-events: none;
}

.diagram-area--header,
.diagram-area--subject,
.diagram-area--colored {
  background: var(--tone-bg);
  border-style: solid;
}

.diagram-area--subject {
  --tone-bg: color-mix(in srgb, var(--accent-soft) 45%, transparent);
  --tone-main: var(--accent-line);
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
  background: var(--surface);
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
