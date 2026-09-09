<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue'
import { DIAGRAM } from '~/config/injection-keys'

// One card of a `:::Diagram`, addressed by `id` from the `::Edge` children.
interface Props {
  id: string
  /** Grid cell as `col,row` (1-based), for `layout="grid"`. */
  at?: string
  /** Cells spanned as `cols,rows`. */
  span?: string
  picto?: string
  title?: string
  n?: string | number
  planned?: boolean
  /** Fragment step; defaults to the writing order. */
  step?: string | number
  /** `entity`: left-aligned box whose caption lists attributes, one per list item. */
  variant?: 'card' | 'entity'
}

const props = defineProps<Props>()

const registry = inject(DIAGRAM, null)
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
    :class="{ 'diagram-node--entity': variant === 'entity' }"
    :style="gridStyle"
  >
    <PictoCard
      :picto="picto"
      :title="title"
      :n="n"
      :planned="planned"
    >
      <slot />
    </PictoCard>
  </div>
</template>

<style scoped>
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
