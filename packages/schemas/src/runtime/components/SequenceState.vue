<script setup lang="ts">
import { computed, inject } from 'vue'
import { SEQUENCE } from '../injection-keys.ts'
import { stateCells } from '../sequence-grid.ts'

// A row of a `:::Sequence` that lays side by side the value each participant
// holds at that moment, so a gap between two of them reads at a glance.
interface Props {
  /**
   * Values on the lifelines, `id=value` separated by `|`: `a=Draft|b=Sent`.
   * @fr Valeurs posées sur les lignes de vie, `id=valeur` séparés par `|` : `a=Brouillon|b=Envoyé`.
   */
  values: string
  /**
   * Name of the state, written in the left margin.
   * @fr Nom de l'état, écrit dans la marge de gauche.
   */
  label?: string
  /**
   * Tints the row and frames the values: a palette name of the theme, such as `orange`, or a hexadecimal color or a color function.
   * @fr Teinte la rangée et encadre les valeurs : un nom de la palette du thème, comme `orange`, ou une couleur hexadécimale ou une fonction de couleur.
   */
  color?: string
  /**
   * `id` of the values framed in `color`, separated by commas; all of them when absent.
   * @fr `id` des valeurs encadrées de la couleur `color`, séparés par des virgules ; toutes quand il est absent.
   */
  mark?: string
  /**
   * Fragment step; defaults to the reading order.
   * @fr Étape d'apparition ; par défaut, l'ordre de lecture.
   */
  step?: string | number
}

const props = defineProps<Props>()

const registry = inject(SEQUENCE, null)

const cells = computed(() => stateCells(registry?.actors ?? [], props.values, { colored: !!props.color, mark: props.mark }))
</script>

<template>
  <SequenceRow
    :heading="label"
    heading-kind="name"
    :step="step"
    :color="color"
    :band="!!color"
    :actors="cells.map(cell => cell.id)"
  >
    <div
      v-for="cell in cells"
      :key="cell.id"
      class="sequence__cell sequence-state"
      :class="{ 'sequence-state--marked': cell.marked }"
      :style="{ gridColumn: cell.column }"
    >
      {{ cell.value }}
    </div>
  </SequenceRow>
</template>

<style scoped>
.sequence-state {
  justify-self: center;
  padding: 0.25em 0.8em;
  border: 1px solid var(--accent);
  border-radius: 999px;
  background: var(--accent-bg);
  color: var(--accent-strong);
  font-size: 0.85em;
  font-weight: 500;
  white-space: nowrap;
}

.sequence-state--marked {
  border: 1.5px solid var(--tone-main);
  background: var(--surface);
  color: var(--tone-text);
}
</style>
