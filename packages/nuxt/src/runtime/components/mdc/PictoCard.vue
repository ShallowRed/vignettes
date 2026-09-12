<script setup lang="ts">
import { normalizeIconName } from '@vignettes/core/deck'
import { computed } from 'vue'
import { paletteVars } from '../../config/dsfr-palette'

// The card shared by `::Step` (schemes) and `::Node` (diagrams): a DSFR pictogram
// or a Remix icon, a number badge, a title and a caption.
interface Props {
  /** Pictogram path relative to /pictograms, e.g. `digital/coding`. */
  picto?: string
  /** Remix icon (`ri:server-line`), for a dense diagram where a pictogram is too much. */
  icon?: string
  title?: string
  n?: string | number
  /** Target state (dashed frame), as opposed to what runs today. */
  planned?: boolean
  /** `row` sets the pictogram beside the text instead of above it. */
  orientation?: 'column' | 'row'
  /** A DSFR illustrative colour for the icon and the title. */
  color?: string
}

const props = defineProps<Props>()

const pictoSrc = computed(() => (props.picto ? `/pictograms/${props.picto}.svg` : undefined))
const iconName = computed(() => (props.icon ? normalizeIconName(props.icon) : undefined))
const style = computed(() => paletteVars(props.color))
</script>

<template>
  <div
    class="picto-card"
    :class="{
      'picto-card--planned': planned,
      'picto-card--row': orientation === 'row',
      'picto-card--icon': !!iconName && !pictoSrc,
      'picto-card--colored': !!color,
    }"
    :style="style"
  >
    <span
      v-if="n !== undefined && n !== ''"
      class="picto-card__n"
    >{{ n }}</span>
    <img
      v-if="pictoSrc"
      class="picto-card__picto"
      :src="pictoSrc"
      alt=""
    >
    <Icon
      v-else-if="iconName"
      :name="iconName"
      class="picto-card__icon"
      mode="svg"
    />
    <div class="picto-card__body">
      <p
        v-if="title"
        class="picto-card__title"
      >
        {{ title }}
      </p>
      <div class="picto-card__text">
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped>
.picto-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5em;
  padding: 1.1em 0.8em 1em;
  border-radius: 8px;
  text-align: center;
  transition: background 0.3s ease, box-shadow 0.3s ease;
}

.picto-card__body {
  display: flex;
  flex-direction: column;
  gap: inherit;
  min-width: 0;
  width: 100%;
}

.picto-card--planned {
  border: 2px dashed var(--accent, #000091);
}

/* Pictogram beside the text: the card keeps one line of title and stays short,
   which leaves the vertical room for the arrows and their labels. */
.picto-card--row {
  flex-direction: row;
  align-items: center;
  text-align: left;
  gap: 0.8em;
  padding: 0.7em 0.9em;
}

.picto-card--row .picto-card__picto,
.picto-card--row .picto-card__icon {
  flex: 0 0 auto;
}

.picto-card--row .picto-card__body {
  gap: 0.15em;
}

.picto-card--row .picto-card__n {
  position: static;
  flex: 0 0 auto;
}

.picto-card__n {
  position: absolute;
  top: 0.5em;
  left: 0.6em;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.6em;
  height: 1.6em;
  border-radius: 50%;
  background: var(--accent, #000091);
  color: var(--on-contrast, #fff);
  font-size: 0.75em;
  font-weight: 700;
}

.picto-card__picto {
  width: var(--scheme-picto, 6em);
  height: var(--scheme-picto, 6em);
  object-fit: contain;
}

/* An icon is a glyph, so it takes about a third of a pictogram's footprint. */
.picto-card__icon {
  width: calc(var(--scheme-picto, 6em) * 0.5);
  height: calc(var(--scheme-picto, 6em) * 0.5);
  color: var(--tone-text, var(--text-title, #161616));
}

.picto-card--row .picto-card__icon {
  width: calc(var(--scheme-picto, 6em) * 0.6);
  height: calc(var(--scheme-picto, 6em) * 0.6);
}

.picto-card__title {
  margin: 0;
  font-weight: 700;
  line-height: 1.25;
  color: var(--text-title, #161616);
}

.picto-card--colored .picto-card__title {
  color: var(--tone-text);
}

.picto-card__text {
  font-size: 0.8em;
  line-height: 1.35;
  color: var(--text-mention, #666);
}

.picto-card__text:empty {
  display: none;
}

.picto-card__text :deep(p) {
  margin: 0;
}
</style>
