<script setup lang="ts">
import { computed, inject } from 'vue'
import { SEQUENCE } from '../injection-keys.ts'
import { ids, messageGeometry } from '../sequence-grid.ts'

// A row of a `:::Sequence` with one arrow, from one lifeline to another,
// through the lifelines `via` names on the way.
interface Props {
  /**
   * `id` of the participant that sends.
   * @fr `id` du participant qui envoie.
   */
  from: string
  /**
   * `id` of the participant that receives.
   * @fr `id` du participant qui reçoit.
   */
  to: string
  /**
   * `id` of the participants the arrow goes through, separated by commas; each takes a dot.
   * @fr `id` des participants par lesquels passe la flèche, séparés par des virgules ; chacun prend un point.
   */
  via?: string
  /**
   * Text above the arrow.
   * @fr Texte au-dessus de la flèche.
   */
  label?: string
  /**
   * Time written in the left margin, `10 h 00`.
   * @fr Heure écrite dans la marge de gauche, `10 h 00`.
   */
  time?: string
  /**
   * Draws a dashed arrow, for an answer.
   * @fr Dessine une flèche en pointillés, pour une réponse.
   */
  dashed?: boolean
  /**
   * Fragment step; defaults to the reading order.
   * @fr Étape d'apparition ; par défaut, l'ordre de lecture.
   */
  step?: string | number
}

const props = defineProps<Props>()

const registry = inject(SEQUENCE, null)

const geometry = computed(() => messageGeometry(registry?.actors ?? [], props.from, props.to, props.via))
const named = computed(() => [props.from, ...ids(props.via), props.to])
</script>

<template>
  <SequenceRow
    :heading="time"
    heading-kind="time"
    :step="step"
    :actors="named"
  >
    <div
      v-if="geometry"
      class="sequence__cell sequence-message"
      :class="{ 'sequence-message--dashed': dashed, 'sequence-message--reverse': geometry.reverse }"
      :style="{ gridColumn: geometry.gridColumn }"
    >
      <span
        v-if="label"
        class="sequence-message__label"
        :style="{ left: `${geometry.middle}%` }"
      >{{ label }}</span>
      <span
        class="sequence-message__line"
        :style="{ left: `${geometry.left}%`, right: `${geometry.right}%` }"
      />
      <span
        v-for="(dot, index) in geometry.dots"
        :key="index"
        class="sequence-message__dot"
        :style="{ left: `${dot}%` }"
      />
      <svg
        class="sequence-message__head"
        :style="{ left: `${geometry.head}%` }"
        viewBox="0 0 10 10"
        aria-hidden="true"
      >
        <path d="M0 0 L10 5 L0 10 Z" />
      </svg>
    </div>
  </SequenceRow>
</template>

<style scoped>
.sequence-message {
  --line-y: 66%;
  align-self: stretch;
  min-height: 3em;
}

.sequence-message__line {
  position: absolute;
  top: var(--line-y);
  border-top: 2px solid var(--accent);
}

.sequence-message--dashed .sequence-message__line {
  border-top-style: dashed;
}

.sequence-message__dot {
  position: absolute;
  top: var(--line-y);
  width: 0.5em;
  height: 0.5em;
  border-radius: 50%;
  background: var(--accent);
  transform: translate(-50%, calc(-50% + 1px));
}

.sequence-message__head {
  position: absolute;
  top: var(--line-y);
  width: 0.75em;
  height: 0.75em;
  fill: var(--accent);
  transform: translate(-100%, calc(-50% + 1px));
}

.sequence-message--reverse .sequence-message__head {
  transform: translate(0, calc(-50% + 1px)) rotate(180deg);
}

.sequence-message__label {
  position: absolute;
  bottom: calc(100% - var(--line-y) + 0.3em);
  transform: translateX(-50%);
  color: var(--text-title);
  font-weight: 500;
  white-space: nowrap;
}
</style>
