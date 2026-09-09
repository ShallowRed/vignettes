<script setup lang="ts">
import { computed } from 'vue'

// The card shared by `::Step` (schemes) and `::Node` (diagrams): a DSFR pictogram,
// a number badge, a title and a caption.
interface Props {
  /** Pictogram path relative to /pictograms, e.g. `digital/coding`. */
  picto?: string
  title?: string
  n?: string | number
  /** Target state (dashed frame), as opposed to what runs today. */
  planned?: boolean
}

const props = defineProps<Props>()

const pictoSrc = computed(() => (props.picto ? `/pictograms/${props.picto}.svg` : undefined))
</script>

<template>
  <div
    class="picto-card"
    :class="{ 'picto-card--planned': planned }"
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

.picto-card--planned {
  border: 2px dashed var(--accent, #000091);
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

.picto-card__title {
  margin: 0;
  font-weight: 700;
  line-height: 1.25;
  color: var(--text-title, #161616);
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
