<script setup lang="ts">
import type { PresentationData } from '@vignettes/nuxt/types'
import { parserIdFor, slideRanges, splitFrontmatter } from '@vignettes/core/deck'
import { buildPresentationData } from '@vignettes/nuxt/presentation-data'
import { slideAtLine } from '@vignettes/nuxt/slide-map'

const props = defineProps<{
  source: string
  /** A line of the source (1-based): the deck shows the slide that contains it. */
  line?: number
}>()

// Several decks share a page: none of them writes the URL hash, each one reads
// the keyboard once clicked, and a narrow screen keeps the slide view, since
// reveal.js draws an embedded deck blank in its scroll view.
const EMBED_CONFIG = {
  hash: false,
  keyboardCondition: 'focused',
  scrollActivationWidth: null,
}

const presentation = useTemplateRef<{
  getInstance: () => { layout: () => void } | null | undefined
  slide: (h: number, v?: number) => void
  sync: () => void
}>('presentation')

function showLine() {
  if (props.line == null)
    return
  const ranges = slideRanges(props.source, parserIdFor(splitFrontmatter(props.source).data))
  const { h, v } = slideAtLine(ranges, props.line)
  presentation.value?.slide(h, v)
}

// Parsed in the browser, which highlights the code blocks of the deck itself.
// A source that fails to parse keeps the last render on screen.
const data = shallowRef<PresentationData>()
onMounted(() => watch(() => props.source, async (source) => {
  try {
    data.value = await buildPresentationData(source)
  }
  catch {
    return
  }
  // reveal.js registers the added and removed slides, then opens the slide of the line.
  await nextTick()
  presentation.value?.sync()
  showLine()
}, { immediate: true }))

watch(() => props.line, showLine)

const config = computed(() => ({ ...data.value?.metadata.reveal, ...EMBED_CONFIG }))
const ratio = computed(() => `${config.value.width ?? 1280} / ${config.value.height ?? 720}`)

// On a phone the slide is a third of its size: the reader enlarges it to the
// whole screen, turned to landscape when the phone is held upright.
const expanded = ref(false)
const expandButton = useTemplateRef<{ $el: HTMLElement }>('expandButton')
const closeButton = useTemplateRef<{ $el: HTMLElement }>('closeButton')

watch(expanded, async (on) => {
  document.documentElement.style.overflow = on ? 'hidden' : ''
  // reveal.js scales the slides on a window resize, and the frame changed size without one.
  await nextTick()
  presentation.value?.getInstance()?.layout()
  ;(on ? closeButton : expandButton).value?.$el.focus()
})

function closeOnEscape(event: KeyboardEvent) {
  if (event.key === 'Escape')
    expanded.value = false
}

onMounted(() => window.addEventListener('keydown', closeOnEscape))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', closeOnEscape)
  document.documentElement.style.overflow = ''
})
</script>

<template>
  <div class="deck-live">
    <div
      class="deck-live__frame"
      :class="{ 'deck-live__frame--expanded': expanded }"
      :style="{ aspectRatio: expanded ? undefined : ratio }"
    >
      <RevealPresentation
        v-if="data?.slides.length"
        ref="presentation"
        :theme="data.metadata.theme"
        :config="config"
        :lang="data.metadata.lang"
        :code="data.metadata.code"
        :controls="false"
      >
        <RevealSlides :presentation-data="data" />
      </RevealPresentation>
      <UButton
        v-if="expanded"
        ref="closeButton"
        class="deck-live__close"
        icon="i-lucide-x"
        color="neutral"
        variant="solid"
        aria-label="Fermer"
        @click="expanded = false"
      />
    </div>
    <UButton
      v-if="data?.slides.length"
      ref="expandButton"
      class="deck-live__expand"
      icon="i-lucide-maximize-2"
      label="Agrandir"
      color="neutral"
      variant="outline"
      size="sm"
      @click="expanded = true"
    />
  </div>
</template>

<style scoped>
.deck-live {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem;
}

.deck-live__frame {
  --vignettes-deck-height: 100%;
  position: relative;
  width: 100%;
  overflow: hidden;
  border-radius: var(--ui-radius);
  border: 1px solid var(--ui-border);
}

.deck-live__frame--expanded {
  position: fixed;
  inset: 0;
  z-index: 100;
  border: 0;
  border-radius: 0;
  background: var(--ui-bg);
}

/* Upright, the frame takes the screen turned by a quarter, so the slide is as
   wide as the screen is tall. */
@media (orientation: portrait) {
  .deck-live__frame--expanded {
    inset: auto;
    top: 0;
    left: 100vw;
    width: 100dvh;
    height: 100vw;
    transform: rotate(90deg);
    transform-origin: top left;
  }
}

.deck-live__close {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  z-index: 1;
}

@media (min-width: 640px) {
  .deck-live__expand {
    display: none;
  }
}
</style>
