<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  /** Address of the image. */
  src: string
  /** Text alternative of the image. */
  alt?: string
  /** CSS width of the image. */
  width?: string
  /** CSS height of the image. */
  height?: string
  /** CSS `object-fit` of the image in its box. */
  fit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down'
  /** CSS `object-position` of the image in its box. */
  position?: string
  /** Rounds the corners. */
  rounded?: boolean
  /** Draws a shadow under the image. */
  shadow?: boolean
  /** Opens the image full-screen on click: `true` shows `src`, an address shows another image. */
  preview?: boolean | string
}

const props = withDefaults(defineProps<Props>(), {
  alt: '',
  width: 'auto',
  height: 'auto',
  fit: 'contain',
  position: 'center',
  rounded: false,
  shadow: true,
})

defineSlots<{
  /** The caption, in markdown. */
  default?: () => unknown
}>()

const previewSrc = computed(() => {
  if (!props.preview)
    return null
  return typeof props.preview === 'string' ? props.preview : props.src
})
</script>

<template>
  <figure class="image-figure">
    <img
      :src="props.src"
      :alt="props.alt"
      v-bind="previewSrc ? { 'data-preview-image': previewSrc } : {}"
      :class="{
        rounded: props.rounded,
        shadow: props.shadow,
      }"
      :style="{
        width: props.width,
        height: props.height,
        objectFit: props.fit,
        objectPosition: props.position,
      }"
    >
    <figcaption v-if="$slots.default">
      <slot />
    </figcaption>
  </figure>
</template>

<style scoped>
/* The figure shrinks its image to leave room for the caption in the slide. */
.image-figure {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 0;
  margin: 1.5rem 0;
  text-align: center;
}

.image-figure img {
  display: block;
  min-height: 0;
  max-width: 100%;
  margin: 0 auto;
}

.image-figure img.rounded {
  border-radius: var(--radius, 6px);
}

.image-figure img.shadow {
  box-shadow: var(--shadow, 0 2px 8px rgba(0, 0, 0, 0.12));
}

/* The theme aligns every paragraph of a slide to the left. */
.image-figure figcaption :deep(p) {
  margin: 0;
  text-align: inherit;
}

.image-figure figcaption {
  flex: none;
  margin-top: 0.75rem;
  font-size: 0.9em;
  color: #666;
  font-style: italic;
}
</style>
