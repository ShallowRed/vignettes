<script setup lang="ts">
// The first slide of a deck, rendered by the deck page itself in a frame the
// size of a slide and scaled down to the card. The frame shares the session, so
// it shows exactly what the visitor may see.
const props = defineProps<{
  /** The deck page; empty when the deck has nothing to show. */
  src?: string
}>()

const FRAME_WIDTH = 1280
const FRAME_HEIGHT = 720

const box = useTemplateRef<HTMLElement>('box')
const scale = ref(0)
const loaded = ref(false)

let observer: ResizeObserver | undefined
onMounted(() => {
  if (!box.value)
    return
  scale.value = box.value.clientWidth / FRAME_WIDTH
  observer = new ResizeObserver(([entry]) => {
    scale.value = entry!.contentRect.width / FRAME_WIDTH
  })
  observer.observe(box.value)
})
onBeforeUnmount(() => observer?.disconnect())

const frameSrc = computed(() => props.src ? `${props.src}?thumb` : undefined)
</script>

<template>
  <div
    ref="box"
    class="relative aspect-video overflow-hidden bg-muted"
  >
    <iframe
      v-if="frameSrc && scale"
      :src="frameSrc"
      :width="FRAME_WIDTH"
      :height="FRAME_HEIGHT"
      loading="lazy"
      tabindex="-1"
      aria-hidden="true"
      title=""
      class="absolute top-0 left-0 origin-top-left border-0 pointer-events-none transition-opacity duration-300"
      :class="loaded ? 'opacity-100' : 'opacity-0'"
      :style="{ transform: `scale(${scale})` }"
      @load="loaded = true"
    />
    <div
      v-if="!frameSrc"
      class="absolute inset-0 grid place-items-center text-dimmed"
    >
      <UIcon
        name="i-lucide-presentation"
        class="size-8"
      />
    </div>
    <slot />
  </div>
</template>
