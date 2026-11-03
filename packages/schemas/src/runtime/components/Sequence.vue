<script setup lang="ts">
import type { SequenceRegistry } from '../injection-keys.ts'
import { computed, inject, nextTick, onMounted, provide, reactive, ref } from 'vue'
import { SEQUENCE } from '../injection-keys.ts'
import { actorColumn, entrySteps } from '../sequence-grid.ts'

// Exchanges between participants over time. The `::Actor` children head one
// column each and draw its lifeline; each row child (`::Message`, `::State`,
// `::Remark`) takes one row, revealed as one fragment, with its time or its name
// in the left margin.
interface Props {
  /**
   * Reveals the rows one at a time; `:fragments="false"` shows the whole sequence at once.
   * @fr Montre les rangées une à une ; `:fragments="false"` montre toute la séquence d'un coup.
   */
  fragments?: boolean
  /**
   * Dims the rows already shown once a later one is current.
   * @fr Atténue les rangées déjà montrées quand une rangée suivante apparaît.
   */
  dim?: boolean
  /**
   * Scale of the cards and the text; `sm` fits about ten rows on a slide.
   * @fr Taille des cartes et du texte ; `sm` fait tenir une dizaine de rangées sur une diapositive.
   */
  size?: 'sm' | 'md'
  /**
   * When the participants appear: `start`, all of them with the slide; `first-row`, those of the first row and those no row names with the slide, each other one with the first row that names it, in a column kept for it from the start.
   * @fr Moment où les participants apparaissent : `start`, tous avec la diapositive ; `first-row`, ceux de la première rangée et ceux qu'aucune rangée ne nomme avec la diapositive, chacun des autres avec la première rangée qui le nomme, dans une colonne qui lui est gardée dès le départ.
   */
  enter?: 'start' | 'first-row'
}

const props = withDefaults(defineProps<Props>(), {
  fragments: true,
  dim: true,
  size: 'md',
  enter: 'start',
})

defineSlots<{
  /** The `::Actor` blocks, then the `::Message`, `::State` and `::Remark` rows in reading order. */
  default?: () => unknown
}>()

const root = ref<HTMLElement | null>(null)
const revealSync = inject<(() => void) | undefined>('revealSync', undefined)

const actors = reactive<string[]>([])
const rowCount = ref(0)
const registry: SequenceRegistry = {
  actors,
  registerActor(id) {
    if (!actors.includes(id))
      actors.push(id)
  },
  unregisterActor(id) {
    const index = actors.indexOf(id)
    if (index >= 0)
      actors.splice(index, 1)
  },
  registerRow() {
    rowCount.value++
  },
  unregisterRow() {
    rowCount.value--
  },
}
provide(SEQUENCE, registry)

// The participants take the first row; the rows follow in the order of the page.
const gridStyle = computed(() => ({
  gridTemplateColumns: `max-content repeat(${Math.max(1, actors.length)}, minmax(0, 1fr))`,
  gridTemplateRows: rowCount.value ? `auto repeat(${rowCount.value}, auto)` : 'auto',
}))

function reveal(el: HTMLElement, step: string) {
  el.classList.add('fragment')
  el.dataset.fragmentIndex = step
}

// The cells of a row share its fragment index, so the row appears at once
// while its rule and its height stay in place from the start.
onMounted(async () => {
  await nextTick()
  if (!props.fragments || !root.value)
    return
  const rows = [...root.value.querySelectorAll<HTMLElement>('.sequence-row')].map((row, index) => {
    const step = row.dataset.step || String(index)
    row.querySelectorAll<HTMLElement>('.sequence__cell').forEach(cell => reveal(cell, step))
    return { step, actors: row.dataset.actors?.split(',') ?? [] }
  })
  if (props.enter === 'first-row') {
    for (const [id, step] of entrySteps(rows)) {
      root.value.querySelectorAll<HTMLElement>(`[data-actor="${CSS.escape(id)}"]`).forEach(el => reveal(el, step))
    }
  }
  revealSync?.()
})
</script>

<template>
  <div
    ref="root"
    class="sequence"
    :class="[`sequence--${size}`, { 'sequence--dim': dim }]"
    :style="gridStyle"
  >
    <span
      v-for="id in actors"
      :key="id"
      class="sequence__lifeline"
      :style="{ gridColumn: `${actorColumn(actors, id)} / span 1` }"
      :data-actor="id"
      aria-hidden="true"
    />
    <slot />
  </div>
</template>

<style scoped>
.sequence {
  position: relative;
  display: grid;
  width: 100%;
  margin: 0.4em 0;
}

.sequence--sm { --scheme-picto: 2.4em; font-size: 0.72em; }
.sequence--md { --scheme-picto: 2.4em; font-size: 0.85em; }

/* Placed out of the flow, so the rows find their cells free; the card that
   heads the column covers the top of the line. */
.sequence__lifeline {
  position: absolute;
  inset: 0;
  grid-row: 1 / -1;
  pointer-events: none;
}

.sequence__lifeline::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  border-left: 1.5px solid var(--border);
}

.sequence--dim:has(.current-fragment) :deep(.sequence__cell.fragment.visible:not(.current-fragment)) {
  opacity: 0.45;
  transition: opacity 0.3s ease;
}
</style>
