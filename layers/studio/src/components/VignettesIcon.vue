<script setup lang="ts">
// The Vignettes icon: the mark in a rounded light tile, as the favicon draws it,
// for the link preview images. The mark takes 5/8 of the tile width; the two
// back panels take a solid light blue so the icon reads on any background.
const { size } = defineProps<{ size: number }>()

const PANELS = [{ width: 14, color: '#2563eb' }, { width: 8, color: '#93b4f5' }, { width: 6, color: '#93b4f5' }]

/** A length of the 32 x 18 mark, in pixels of the tile. */
const px = (units: number) => `${units * size * 0.625 / 32}px`
</script>

<template>
  <div
    class="flex items-center justify-center bg-[#dbeafe]"
    :style="{ width: `${size}px`, height: `${size}px`, borderRadius: `${size * 0.22}px`, gap: px(2) }"
  >
    <div
      v-for="panel in PANELS"
      :key="panel.width"
      :style="{ width: px(panel.width), height: px(18), backgroundColor: panel.color }"
    />
  </div>
</template>
