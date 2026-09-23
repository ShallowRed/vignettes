<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  src: string
  alt?: string
  width?: string
  height?: string
  fit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down'
  position?: string
  rounded?: boolean
  shadow?: boolean
  /** Enable Reveal.js lightbox. Pass `true` to use `src` as preview, or a URL for a distinct thumbnail. */
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
