<script setup lang="ts">
import { computed, inject } from 'vue'
import { SEQUENCE } from '../injection-keys.ts'
import { actorsCovered, actorsSpan } from '../sequence-grid.ts'

// A row of a `:::Sequence` with a short text laid over the lifelines it concerns.
interface Props {
  /**
   * `id` of the first and the last participant the remark covers, separated by a comma; all of them when absent.
   * @fr `id` du premier et du dernier participant que couvre la remarque, séparés par une virgule ; tous quand il est absent.
   */
  over?: string
  /**
   * Time written in the left margin, `10 h 00`.
   * @fr Heure écrite dans la marge de gauche, `10 h 00`.
   */
  time?: string
  /**
   * Color of the remark: a palette name of the theme, such as `orange`, or a hexadecimal color or a color function.
   * @fr Couleur de la remarque : un nom de la palette du thème, comme `orange`, ou une couleur hexadécimale ou une fonction de couleur.
   */
  color?: string
  /**
   * Fragment step; defaults to the reading order.
   * @fr Étape d'apparition ; par défaut, l'ordre de lecture.
   */
  step?: string | number
}

const props = defineProps<Props>()

defineSlots<{
  /** The text of the remark. */
  default?: () => unknown
}>()

const registry = inject(SEQUENCE, null)

const gridColumn = computed(() => actorsSpan(registry?.actors ?? [], props.over))
</script>

<template>
  <SequenceRow
    :heading="time"
    heading-kind="time"
    :step="step"
    :color="color"
    :actors="actorsCovered(registry?.actors ?? [], over)"
  >
    <div
      class="sequence__cell sequence-remark"
      :style="{ gridColumn }"
    >
      <slot />
    </div>
  </SequenceRow>
</template>

<style scoped>
.sequence-remark {
  margin: 0 0.4em;
  padding: 0.35em 0.9em;
  border-left: 3px solid var(--tone-main, var(--accent));
  background: var(--tone-bg, var(--accent-bg));
  color: var(--tone-text, var(--accent-strong));
  font-weight: 500;
  text-align: center;
}

.sequence-remark :deep(p) {
  margin: 0;
  text-align: inherit;
}
</style>
