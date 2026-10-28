<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue'
import { DIAGRAM } from '../injection-keys.ts'

// One card of a `:::Diagram`, addressed by `id` from the `::Edge` children.
interface Props {
  /**
   * Name the `::Edge` blocks use to reach the node.
   * @fr Nom par lequel les blocs `::Edge` désignent le nœud.
   */
  id: string
  /**
   * Grid cell as `col,row` (1-based), for `layout="grid"`.
   * @fr Case de la grille, `colonne,rangée` en partant de 1, pour `layout="grid"`.
   */
  at?: string
  /**
   * Cells spanned as `cols,rows`.
   * @fr Cases occupées, `colonnes,rangées`.
   */
  span?: string
  /**
   * Pictogram, as its path under `/pictograms` without the extension: `digital/coding`.
   * @fr Pictogramme, par son chemin sous `/pictograms` sans l'extension : `digital/coding`.
   */
  picto?: string
  /**
   * Remix icon, `ri:server-line`, lighter than a pictogram.
   * @fr Icône Remix, `ri:server-line`, plus légère qu'un pictogramme.
   */
  icon?: string
  /**
   * Color of the icon and the title: a palette name of the theme, such as `green`, or a hexadecimal color or a color function, such as `#2a7f62`.
   * @fr Couleur de l'icône et du titre : un nom de la palette du thème, comme `green`, ou une couleur hexadécimale ou une fonction de couleur, comme `#2a7f62`.
   */
  color?: string
  /**
   * Title of the card.
   * @fr Titre de la carte.
   */
  title?: string
  /**
   * Number in a badge.
   * @fr Numéro affiché dans une pastille.
   */
  n?: string | number
  /**
   * Draws a dashed frame, for a target state.
   * @fr Dessine un cadre en pointillés, pour un état visé.
   */
  planned?: boolean
  /**
   * Fragment step; defaults to the writing order.
   * @fr Étape d'apparition ; par défaut, l'ordre d'écriture.
   */
  step?: string | number
  /**
   * `entity`: left-aligned box whose caption lists attributes, one per list item.
   * `flow`: a pill for the data that travels between two machines.
   * `plain`: title and caption without a card, for a row or column heading.
   * @fr `entity` : boîte alignée à gauche dont la légende liste des attributs, un par élément de liste. `flow` : une pastille pour les données qui circulent entre deux machines. `plain` : titre et légende sans carte, pour un en-tête de rangée ou de colonne.
   */
  variant?: 'card' | 'entity' | 'flow' | 'plain'
  /**
   * Fills the card with the accent, for the node the slide is about.
   * @fr Remplit la carte de la couleur d'accent, pour le nœud dont parle la diapositive.
   */
  emphasis?: boolean
  /**
   * Pictogram above the text or beside it; defaults to the diagram's `tiles`.
   * @fr Pictogramme au-dessus du texte ou à côté ; par défaut, le `tiles` du diagramme.
   */
  orientation?: 'column' | 'row'
}

const props = defineProps<Props>()

defineSlots<{
  /** The caption, in markdown; with `variant="entity"`, a list of attributes, one per item. */
  default?: () => unknown
}>()

const registry = inject(DIAGRAM, null)
const orientation = computed(() => props.orientation ?? registry?.tiles ?? 'column')
const el = ref<HTMLElement | null>(null)

const gridStyle = computed(() => {
  if (!props.at)
    return undefined
  const [col, row] = props.at.split(',').map(v => Number.parseInt(v.trim(), 10))
  const [sc, sr] = (props.span ?? '1,1').split(',').map(v => Number.parseInt(v.trim(), 10) || 1)
  return {
    gridColumn: col ? `${col} / span ${sc}` : undefined,
    gridRow: row ? `${row} / span ${sr}` : undefined,
  }
})

onMounted(() => {
  if (el.value && registry) {
    registry.registerNode({
      id: props.id,
      el: el.value,
      step: props.step === undefined || props.step === '' ? undefined : Number(props.step),
    })
  }
})
</script>

<template>
  <div
    ref="el"
    class="diagram-node"
    :class="[variant ? `diagram-node--${variant}` : undefined, { 'diagram-node--emphasis': emphasis }]"
    :style="gridStyle"
  >
    <PictoCard
      :picto="picto"
      :icon="icon"
      :color="color"
      :title="title"
      :n="n"
      :planned="planned"
      :orientation="orientation"
    >
      <slot />
    </PictoCard>
  </div>
</template>

<style scoped>
/* The data in transit: a pill in the accent tint, one line in the regular
   weight, so it reads as a message between two machines and not as a third one. */
.diagram-node--flow :deep(.picto-card) {
  padding: 0.5em 1.1em;
  border-radius: 999px;
  background: var(--accent-soft);
  border: none;
  text-align: center;
  --text-title: var(--on-surface-title);
  --text-default: var(--on-surface-default);
  --text-mention: var(--on-surface-mention);
}

.diagram-node--flow :deep(.picto-card__title) {
  font-size: 0.9em;
  font-weight: 400;
  color: var(--accent-strong);
}

/* A heading in the grid: no card, the title in the running text color. */
.diagram-node.diagram-node--plain :deep(.picto-card),
.diagram-node.diagram-node--plain.current-fragment :deep(.picto-card) {
  padding: 0.2em 0;
  background: none;
  border: none;
  text-align: left;
  align-items: flex-start;
  box-shadow: none;
}

.diagram-node.diagram-node--flow.current-fragment :deep(.picto-card) {
  background: var(--accent-soft);
}

.diagram-node--plain :deep(.picto-card__title) {
  color: var(--text-title);
}

.diagram-node.diagram-node--emphasis :deep(.picto-card) {
  background: var(--accent-soft);
  --text-title: var(--on-surface-title);
  --text-default: var(--on-surface-default);
  --text-mention: var(--on-surface-mention);
  border-color: var(--accent);
}

.diagram-node--emphasis :deep(.picto-card__title),
.diagram-node--emphasis :deep(.picto-card__icon) {
  color: var(--accent-strong);
}

.diagram-node--entity :deep(.picto-card) {
  align-items: stretch;
  text-align: left;
  padding: 0.7em 0.9em 0.6em;
  gap: 0.4em;
}

.diagram-node--entity :deep(.picto-card__picto) {
  width: 2.2em;
  height: 2.2em;
}

.diagram-node--entity :deep(.picto-card__title) {
  padding-bottom: 0.35em;
  border-bottom: 1px solid var(--accent-line);
}

.diagram-node--entity :deep(.picto-card__text) {
  color: var(--text-default);
}

.diagram-node--entity :deep(.picto-card__text ul) {
  display: block;
  margin: 0;
  padding: 0;
  list-style: none;
}

.diagram-node--entity :deep(.picto-card__text li) {
  padding: 0.2em 0;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, var(--surface));
  line-height: 1.3;
}

.diagram-node--entity :deep(.picto-card__text li)::before {
  content: none;
}

.diagram-node--entity :deep(.picto-card__text li:last-child) {
  border-bottom: none;
}
</style>
