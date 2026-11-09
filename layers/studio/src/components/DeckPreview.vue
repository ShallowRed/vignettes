<script setup lang="ts">
import type { DeckPreview } from '#shared/presentations'
import { previewTokens } from '#shared/presentations'
import { DEFAULT_SLIDE_WIDTH } from '@vignettes/core/render'
import { getThemeTokens } from '@vignettes/core/theme'

// A deck's title slide drawn in HTML and CSS: its background, its pretitle,
// title and subtitle, in the type and colors its theme declares for previews.
const props = defineProps<{
  preview?: DeckPreview
  /** Shown when the title slide has no heading. */
  fallbackTitle: string
}>()

const tokens = computed(() => props.preview ? previewTokens(props.preview) : undefined)
const gradient = computed(() => tokens.value?.titleGradient && tokens.value.titleGradient !== 'none'
  ? tokens.value.titleGradient
  : undefined)

const style = computed(() => ({
  '--preview-font': tokens.value?.fontFamily,
  '--preview-title': tokens.value?.titleColor,
  '--preview-title-gradient': gradient.value,
  '--preview-text': tokens.value?.textColor,
  // Without a title slide, the frame is an empty surface of the studio.
  '--preview-surface': props.preview ? tokens.value?.surface : 'var(--ui-bg)',
  'backgroundImage': props.preview?.background ? `url("${props.preview.background}")` : undefined,
}))

// The bloc marque keeps its size on the slide: it takes the scale of the card to
// the slide width of the theme, else to the default slide width. The preview
// stylesheet of a theme that draws it styles it, as the theme does on the slides.
const frame = ref<HTMLElement | null>(null)
const width = ref(0)
let observer: ResizeObserver | undefined
onMounted(() => {
  observer = new ResizeObserver(([entry]) => width.value = entry?.contentRect.width ?? 0)
  if (frame.value)
    observer.observe(frame.value)
})
onUnmounted(() => observer?.disconnect())
const brandZoom = computed(() => {
  const slideWidth = Number(getThemeTokens(props.preview?.theme)?.reveal?.width) || DEFAULT_SLIDE_WIDTH
  return width.value / slideWidth
})

// Every card of a theme asks for the same stylesheet; the key keeps one link.
useHead(() => ({
  link: tokens.value?.fontsStylesheet
    ? [{ key: `preview-fonts:${tokens.value.fontsStylesheet}`, rel: 'stylesheet', href: tokens.value.fontsStylesheet }]
    : [],
}))
</script>

<template>
  <div
    ref="frame"
    class="deck-preview"
    :style="style"
  >
    <div
      v-if="preview?.brand && width"
      class="deck-preview__brand"
      :data-background-image="preview.background || undefined"
      aria-hidden="true"
    >
      <div :style="{ zoom: brandZoom }">
        <SlideBrand :brand="preview.brand" />
      </div>
    </div>
    <div
      v-if="preview"
      class="deck-preview__slide"
      aria-hidden="true"
    >
      <p
        v-if="preview.pretitle"
        class="deck-preview__line"
      >
        {{ preview.pretitle }}
      </p>
      <p
        class="deck-preview__title"
        :class="{ 'deck-preview__title--gradient': gradient }"
      >
        {{ preview.title ?? fallbackTitle }}
      </p>
      <p
        v-if="preview.subtitle"
        class="deck-preview__line"
      >
        {{ preview.subtitle }}
      </p>
    </div>
    <div
      v-else
      class="deck-preview__empty"
    >
      <UIcon
        name="i-lucide-presentation"
        class="size-8"
      />
    </div>
    <slot />
  </div>
</template>

<style scoped>
.deck-preview {
  position: relative;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  font-family: var(--preview-font, system-ui, sans-serif);
  background: var(--preview-surface, #fff) center / cover no-repeat;
  container-type: inline-size;
}

/* Sizes follow the card width, the way a slide scales to its window. */
.deck-preview__slide {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1.5cqw;
  padding: 0 9cqw;
}

.deck-preview__title {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  font-size: 6cqw;
  font-weight: 800;
  line-height: 1.08;
  letter-spacing: -0.02em;
  color: var(--preview-title, #161616);
  text-wrap: balance;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

.deck-preview__title--gradient {
  padding-bottom: 0.12em;
  background: var(--preview-title-gradient);
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.deck-preview__line {
  margin: 0;
  font-size: 2.3cqw;
  line-height: 1.3;
  color: var(--preview-text, #3a3a3a);
}

.deck-preview__brand {
  position: absolute;
  top: 3cqw;
  left: 9cqw;
  z-index: 1;
}

.deck-preview__empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--ui-text-dimmed);
}
</style>

<style>
/* Hidden until the preview stylesheet of the theme draws it. */
:where(.deck-preview__brand .slide-brand) {
  display: none;
}
</style>
