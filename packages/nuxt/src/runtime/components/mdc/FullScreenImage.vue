<script setup lang="ts">
// The slide parser takes `src` and `overlay` for the slide background, which
// Reveal spreads over the whole screen, and `heading` for the slide heading;
// the component lays the text over it.
interface Props {
  src: string
  alt?: string
  overlay?: string | number
  heading?: 'hidden' | 'print'
}

defineProps<Props>()
</script>

<template>
  <div class="full-screen-image">
    <div
      v-if="$slots.default"
      class="image-content"
    >
      <slot />
    </div>
  </div>
</template>

<style scoped>
.full-screen-image {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-content {
  position: relative;
  z-index: 1;
  color: white;
  text-align: center;
  padding: 2rem;
  max-width: 80%;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
}

.image-content :deep(h1),
.image-content :deep(h2),
.image-content :deep(h3) {
  margin: 0;
  color: white;
}

.image-content :deep(p) {
  font-size: 1.3em;
  margin: 1rem 0 0;
}
</style>
