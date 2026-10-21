<script setup lang="ts">
import type { DeckPreview } from '#shared/presentations'
import { getThemeTokens } from '@vignettes/core/theme'

// A deck's title slide drawn in HTML and CSS: its background, its pretitle,
// title and subtitle, in the type and colors its theme declares for previews.
const props = defineProps<{
  preview?: DeckPreview
  /** Shown when the title slide has no heading. */
  fallbackTitle: string
}>()

const tokens = computed(() => {
  if (!props.preview)
    return undefined
  const { levels, ...base } = getThemeTokens(props.preview.theme)?.preview ?? {}
  const level = props.preview.headingLevel ? levels?.[props.preview.headingLevel] : undefined
  return { ...base, ...level }
})
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

// Every card of a theme asks for the same stylesheet; the key keeps one link.
useHead(() => ({
  link: tokens.value?.fontsStylesheet
    ? [{ key: `preview-fonts:${tokens.value.fontsStylesheet}`, rel: 'stylesheet', href: tokens.value.fontsStylesheet }]
    : [],
}))
</script>

<template>
  <div
    class="deck-preview"
    :style="style"
  >
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

.deck-preview__empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--ui-text-dimmed);
}
</style>
