<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue'
import { JSON_TOUR } from '../injection-keys.ts'

// One described area of a `:::JsonTour`: a card whose fragment highlights the
// lines it names in the file beside it.
interface Props {
  /**
   * Line range in the file, `12` or `12-24`.
   * @fr Lignes du fichier, `12` ou `12-24`.
   */
  lines?: string
  /**
   * Area to highlight on the tour's image, `x,y,w,h` in percent.
   * @fr Zone à mettre en évidence sur l'image de la visite, `x,y,l,h` en pourcentages.
   */
  spot?: string
  /**
   * Pictogram, as its path under `/pictograms` without the extension: `digital/coding`.
   * @symbol pictogram
   * @fr Pictogramme, par son chemin sous `/pictograms` sans l'extension : `digital/coding`.
   */
  picto?: string
  /**
   * Remix icon (`ri:shield-check-line`), sharper than a pictogram at the xs and sm sizes.
   * @symbol icon
   * @fr Icône Remix (`ri:shield-check-line`), plus nette qu'un pictogramme aux tailles xs et sm.
   */
  icon?: string
  /**
   * Title of the zone card.
   * @fr Titre de la carte de la zone.
   */
  title?: string
  /**
   * Number in a badge.
   * @fr Numéro affiché dans une pastille.
   */
  n?: string | number
  /**
   * Fragment step; defaults to the writing order.
   * @fr Étape d'apparition ; par défaut, l'ordre d'écriture.
   */
  step?: string | number
  /**
   * The step this slide is on, for a tour whose steps a deck spreads over several slides.
   * @fr L'étape où en est cette diapositive, pour une visite dont les étapes sont réparties sur plusieurs diapositives.
   */
  current?: boolean
  /**
   * Words of its lines to paint while the zone is current, separated by `|`.
   * @fr Mots de ses lignes à surligner pendant que la zone est en cours, séparés par `|`.
   */
  mark?: string
  /**
   * Words of its lines to underline while the zone is current, separated by `|`.
   * @fr Mots de ses lignes à souligner pendant que la zone est en cours, séparés par `|`.
   */
  underline?: string
}

const props = defineProps<Props>()

defineSlots<{
  /** What these lines hold, in markdown. */
  default?: () => unknown
}>()

const registry = inject(JSON_TOUR, null)
const el = ref<HTMLElement | null>(null)
const step = computed(() => (props.step === undefined || props.step === '' ? undefined : Number(props.step)))

onMounted(() => {
  if (el.value && registry)
    registry.registerZone({ el: el.value, lines: props.lines, spot: props.spot, step: step.value, mark: props.mark, underline: props.underline })
})
</script>

<template>
  <div
    ref="el"
    class="json-tour-zone"
    :class="{ 'current-fragment': current }"
  >
    <PictoCard
      :picto="picto"
      :icon="icon"
      :title="title"
      :n="n"
      orientation="row"
    >
      <slot />
    </PictoCard>
  </div>
</template>

<style scoped>
.json-tour-zone + .json-tour-zone {
  margin-top: 0.5em;
}

.json-tour-zone :deep(.picto-card) {
  background: var(--surface);
  --text-title: var(--on-surface-title);
  --text-default: var(--on-surface-default);
  --text-mention: var(--on-surface-mention);
  border: 1px solid var(--border);
}

/* An icon stays sharp at the tour's small sizes, where a pictogram's detail is
   lost; it takes a quarter more room than in a scheme card. */
.json-tour-zone :deep(.picto-card--row .picto-card__icon) {
  width: calc(var(--scheme-picto, 6em) * 0.75);
  height: calc(var(--scheme-picto, 6em) * 0.75);
  color: var(--accent);
}

/* The current zone turns its border to the accent and thickens it outward. */
.json-tour-zone.current-fragment :deep(.picto-card) {
  background: var(--accent-bg);
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}
</style>
