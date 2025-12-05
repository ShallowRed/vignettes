<script setup lang="ts">
interface Props {
  src: string
  title?: string
  width?: string
  height?: string
  allow?: string
  frameborder?: string
  fullwidth?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  width: '100%',
  height: '500px',
  allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
  frameborder: '0',
  fullwidth: true,
})
</script>

<template>
  <div
    class="iframe-container"
    :class="{ fullwidth: props.fullwidth }"
  >
    <iframe
      :src="props.src"
      :title="props.title"
      :style="{ width: props.width, height: props.height }"
      :allow="props.allow"
      :frameborder="props.frameborder"
      allowfullscreen
      data-preload
    />
  </div>
</template>

<style scoped>
.iframe-container {
  position: relative;
  width: 100%;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.iframe-container.fullwidth {
  /* Break out of Reveal.js scaling constraints */
  width: 100%;
  border-radius: 0;
}

.iframe-container iframe {
  display: block;
  border: none;
  min-width: 100%;
}
</style>
