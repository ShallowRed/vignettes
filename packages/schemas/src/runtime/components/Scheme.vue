<script setup lang="ts">
import { provide } from 'vue'
import { SCHEME_ARROWS, SCHEME_FRAGMENTS, SCHEME_TILES } from '../injection-keys.ts'

// A row of `::Step` cards linked by arrows, each step a Reveal fragment by
// default so the diagram builds up as the speaker talks.
interface Props {
  /**
   * Reveals each step as a fragment; `:fragments="false"` shows the whole row at once.
   * @fr Montre les étapes une à une ; `:fragments="false"` montre toute la rangée d'un coup.
   */
  fragments?: boolean
  /**
   * Dims the steps already shown once a later one is current.
   * @fr Atténue les étapes déjà montrées quand une étape suivante apparaît.
   */
  dim?: boolean
  /**
   * Links the steps with arrows; `:arrows="false"` gives a plain row of cards.
   * @fr Relie les étapes par des flèches ; `:arrows="false"` donne une rangée de cartes sans flèches.
   */
  arrows?: boolean
  /**
   * Scale of the pictograms.
   * @fr Taille des pictogrammes.
   */
  size?: 'sm' | 'md' | 'lg'
  /**
   * Card shape for every `::Step`: pictogram above the text, or beside it.
   * @fr Forme des cartes de chaque `::Step` : pictogramme au-dessus du texte, ou à côté.
   */
  tiles?: 'column' | 'row'
}

const props = withDefaults(defineProps<Props>(), {
  fragments: true,
  dim: true,
  arrows: true,
  size: 'md',
  tiles: 'column',
})

defineSlots<{
  /** The `::Step` blocks of the row. */
  default?: () => unknown
}>()

provide(SCHEME_FRAGMENTS, props.fragments)
provide(SCHEME_ARROWS, props.arrows)
provide(SCHEME_TILES, props.tiles)
</script>

<template>
  <div
    class="scheme"
    :class="[`scheme--${size}`, { 'scheme--dim': dim, 'scheme--no-arrows': !arrows }]"
  >
    <slot />
  </div>
</template>

<style scoped>
.scheme {
  display: flex;
  align-items: stretch;
  width: 100%;
  margin: 0.5em 0;
}

.scheme--sm { --scheme-picto: 4.5em; font-size: 0.8em; }
.scheme--md { --scheme-picto: 6em; font-size: 0.9em; }
.scheme--lg { --scheme-picto: 8em; font-size: 1em; }

.scheme--no-arrows {
  gap: 1em;
}

.scheme--dim:has(.current-fragment) :deep(.scheme-step.fragment.visible:not(.current-fragment)) {
  opacity: 0.4;
  transition: opacity 0.3s ease;
}

.scheme :deep(.scheme-step.current-fragment .scheme-step__card) {
  background: var(--accent-bg);
  --text-title: var(--on-surface-title);
  --text-default: var(--on-surface-default);
  --text-mention: var(--on-surface-mention);
  box-shadow: inset 0 0 0 2px var(--accent);
}
</style>
