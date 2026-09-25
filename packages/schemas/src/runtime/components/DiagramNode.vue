<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue'
import { DIAGRAM } from '../injection-keys.ts'

// One card of a `:::Diagram`, addressed by `id` from the `::Edge` children.
interface Props {
  id: string
  /** Grid cell as `col,row` (1-based), for `layout="grid"`. */
  at?: string
  /** Cells spanned as `cols,rows`. */
  span?: string
  picto?: string
  /** Remix icon instead of a pictogram. */
  icon?: string
  /** A DSFR illustrative colour for the icon and the title. */
  color?: string
  title?: string
  n?: string | number
  planned?: boolean
  /** Fragment step; defaults to the writing order. */
  step?: string | number
  /**
   * `entity`: left-aligned box whose caption lists attributes, one per list item.
   * `flow`: a pill for the data that travels between two machines.
   * `plain`: title and caption without a card, for a row or column heading.
   */
  variant?: 'card' | 'entity' | 'flow' | 'plain'
  /** Fills the card with the accent: the one node the screen is about. */
  emphasis?: boolean
  /** Pictogram above the text or beside it; defaults to the diagram's `tiles`. */
  orientation?: 'column' | 'row'
}

const props = defineProps<Props>()

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
  background: var(--accent-soft, #e3e3fd);
  border: none;
  text-align: center;
  --text-title: var(--on-surface-title);
  --text-default: var(--on-surface-default);
  --text-mention: var(--on-surface-mention);
}

.diagram-node--flow :deep(.picto-card__title) {
  font-size: 0.9em;
  font-weight: 400;
  color: var(--dsfr-blue-france-sun-113, #000091);
}

/* A heading in the grid: no card, the title in the running text colour. */
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
  background: var(--accent-soft, #e3e3fd);
}

.diagram-node--plain :deep(.picto-card__title) {
  color: var(--text-title, #161616);
}

.diagram-node.diagram-node--emphasis :deep(.picto-card) {
  background: var(--accent-soft, #e3e3fd);
  --text-title: var(--on-surface-title);
  --text-default: var(--on-surface-default);
  --text-mention: var(--on-surface-mention);
  border-color: var(--accent, #000091);
}

.diagram-node--emphasis :deep(.picto-card__title),
.diagram-node--emphasis :deep(.picto-card__icon) {
  color: var(--dsfr-blue-france-sun-113, #000091);
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
  border-bottom: 1px solid var(--accent-soft, #e3e3fd);
}

.diagram-node--entity :deep(.picto-card__text) {
  color: var(--text-default, #161616);
}

.diagram-node--entity :deep(.picto-card__text ul) {
  display: block;
  margin: 0;
  padding: 0;
  list-style: none;
}

.diagram-node--entity :deep(.picto-card__text li) {
  padding: 0.2em 0;
  border-bottom: 1px solid #f0f0f5;
  line-height: 1.3;
}

.diagram-node--entity :deep(.picto-card__text li)::before {
  content: none;
}

.diagram-node--entity :deep(.picto-card__text li:last-child) {
  border-bottom: none;
}
</style>
