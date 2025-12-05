<script setup lang="ts">
interface Props {
  src: string
  type?: 'iframe' | 'image'
  alt?: string
  title?: string
  reverse?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  type: 'iframe',
  alt: '',
  title: '',
  reverse: false,
})
</script>

<template>
  <div
    class="split-slide-wrapper"
    :class="{ reverse: props.reverse }"
  >
    <div class="split-content">
      <slot />
    </div>
    <div class="split-media">
      <iframe
        v-if="props.type === 'iframe'"
        :src="props.src"
        :title="props.title"
        frameborder="0"
        allowfullscreen
      />
      <img
        v-else
        :src="props.src"
        :alt="props.alt"
      >
    </div>
  </div>
</template>

<style scoped>
.split-slide-wrapper {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 2rem;
  height: 100%;
  width: 100%;
  align-items: stretch;
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 1rem;
  box-sizing: border-box;
}

.split-slide-wrapper.reverse {
  grid-template-columns: 2fr 1fr;
}

.split-slide-wrapper.reverse .split-content {
  order: 2;
}

.split-slide-wrapper.reverse .split-media {
  order: 1;
}

.split-content {
  display: flex;
  flex-direction: column;
  justify-content: center;
  text-align: left;
  padding: 1rem;
}

.split-content :deep(h3),
.split-content :deep(h4) {
  margin-top: 0;
  margin-bottom: 1rem;
}

.split-content :deep(p) {
  margin: 0.5rem 0;
}

.split-content :deep(ul),
.split-content :deep(ol) {
  margin: 0.5rem 0;
  padding-left: 1.5rem;
}

.split-media {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.split-media iframe {
  width: 100%;
  height: 100%;
  min-height: 400px;
  border: none;
}

.split-media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
