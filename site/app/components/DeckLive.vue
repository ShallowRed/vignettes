<script setup lang="ts">
import { buildPresentationData } from '@vignettes/nuxt/presentation-data'

const props = defineProps<{
  source: string
}>()

// Several decks share a page: none of them writes the URL hash, each one reads
// the keyboard once clicked, and a narrow screen keeps the slide view, since
// reveal.js draws an embedded deck blank in its scroll view.
const EMBED_CONFIG = {
  hash: false,
  keyboardCondition: 'focused',
  scrollActivationWidth: null,
}

// Parsed in the browser, which highlights the code blocks of the deck itself.
const { data } = useAsyncData(`deck-${useId()}`, () => buildPresentationData(props.source), { server: false })

const config = computed(() => ({ ...data.value?.metadata.reveal, ...EMBED_CONFIG }))
const ratio = computed(() => `${config.value.width ?? 1280} / ${config.value.height ?? 720}`)
</script>

<template>
  <div
    class="deck-live"
    :style="{ aspectRatio: ratio }"
  >
    <RevealPresentation
      v-if="data?.slides.length"
      :theme="data.metadata.theme"
      :config="config"
      :lang="data.metadata.lang"
      :code="data.metadata.code"
      :controls="false"
    >
      <RevealSlides :presentation-data="data" />
    </RevealPresentation>
  </div>
</template>

<style scoped>
.deck-live {
  --vignettes-deck-height: 100%;
  position: relative;
  width: 100%;
  overflow: hidden;
  border-radius: var(--ui-radius);
  border: 1px solid var(--ui-border);
}
</style>
