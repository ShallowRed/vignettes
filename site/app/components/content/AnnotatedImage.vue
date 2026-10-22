<script setup lang="ts">
// `::annotated-image` shows an image with numbered markers. A marker is placed
// by `x` and `y`, in percent of the image width and height, and keeps its size
// in proportion to the image. `width` and `height` give the image ratio, so the
// markers keep their place before the image loads. The markers are decorative:
// the numbered list that follows the image in the page describes each of them,
// and the `alt` text points to that list.
defineProps<{
  src: string
  alt: string
  width: number
  height: number
  markers: { x: number, y: number }[]
}>()
</script>

<template>
  <div
    class="annotated-image"
    :style="{ aspectRatio: `${width} / ${height}` }"
  >
    <ProseImg
      :src="src"
      :alt="alt"
    />
    <span
      v-for="(marker, index) in markers"
      :key="index"
      class="annotated-image-marker"
      :style="{ left: `${marker.x}%`, top: `${marker.y}%` }"
      aria-hidden="true"
    >{{ index + 1 }}</span>
  </div>
</template>

<style scoped>
.annotated-image {
  position: relative;
  margin-block: 1.5rem;
  container-type: inline-size;
}

.annotated-image :deep(img) {
  display: block;
  width: 100%;
  height: 100%;
  margin: 0;
}

.annotated-image-marker {
  position: absolute;
  display: grid;
  place-items: center;
  width: 3cqi;
  height: 3cqi;
  translate: -50% -50%;
  border-radius: 9999px;
  background: var(--ui-primary);
  color: var(--ui-bg);
  box-shadow: 0 0 0 0.2cqi white;
  font-size: 1.9cqi;
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}
</style>
