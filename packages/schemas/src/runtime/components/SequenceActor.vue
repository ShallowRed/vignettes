<script setup lang="ts">
import { computed, inject, onBeforeUnmount } from 'vue'
import { SEQUENCE } from '../injection-keys.ts'
import { actorColumn } from '../sequence-grid.ts'

// A participant of a `:::Sequence`: the card that heads its column, above its lifeline.
interface Props {
  /**
   * Name the rows use to reach the participant.
   * @fr Nom par lequel les rangées désignent le participant.
   */
  id: string
  /**
   * Name of the participant.
   * @fr Nom du participant.
   */
  title?: string
  /**
   * Remix icon, `ri:user-line`, lighter than a pictogram.
   * @symbol icon
   * @fr Icône Remix, `ri:user-line`, plus légère qu'un pictogramme.
   */
  icon?: string
  /**
   * Pictogram, as its path under `/pictograms` without the extension: `digital/coding`.
   * @symbol pictogram
   * @fr Pictogramme, par son chemin sous `/pictograms` sans l'extension : `digital/coding`.
   */
  picto?: string
  /**
   * Color of the icon and the title: a palette name of the theme, such as `green`, or a hexadecimal color or a color function, such as `#2a7f62`.
   * @fr Couleur de l'icône et du titre : un nom de la palette du thème, comme `green`, ou une couleur hexadécimale ou une fonction de couleur, comme `#2a7f62`.
   */
  color?: string
}

const props = defineProps<Props>()

const registry = inject(SEQUENCE, null)
registry?.registerActor(props.id)
onBeforeUnmount(() => registry?.unregisterActor(props.id))
const column = computed(() => actorColumn(registry?.actors ?? [], props.id))
</script>

<template>
  <div
    class="sequence-actor"
    :style="{ gridColumn: column, gridRow: 1 }"
    :data-actor="id"
  >
    <PictoCard
      :icon="icon"
      :picto="picto"
      :title="title"
      :color="color"
      orientation="row"
    />
  </div>
</template>

<style scoped>
.sequence-actor {
  position: relative;
  z-index: 1;
  display: flex;
  align-self: stretch;
  padding: 0 0.3em 0.8em;
}

.sequence-actor :deep(.picto-card) {
  flex: 1 1 auto;
  justify-content: center;
  gap: 0.55em;
  padding: 0.55em 0.7em;
  background: var(--surface);
  --text-title: var(--on-surface-title);
  --text-default: var(--on-surface-default);
  --text-mention: var(--on-surface-mention);
  border: 1px solid var(--border);
}

.sequence-actor :deep(.picto-card__title) {
  margin: 0;
  font-size: 0.85em;
  line-height: 1.2;
}

.sequence-actor :deep(.picto-card__body) {
  width: auto;
}
</style>
