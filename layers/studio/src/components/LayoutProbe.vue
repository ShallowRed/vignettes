<script setup lang="ts">
import type { PresentationData } from '@vignettes/nuxt/types'
import type { RevealApi } from 'reveal.js'
import type { LayoutReading } from '../utils/editor-layout'
import { probeRevealConfig } from '../utils/layout-probe'
import { bodyReading, presentSection, sectionOverflow, transitionsEnded } from '../utils/preview-overflow'

// The hidden render the layout panel measures: one slide per setting it
// measures, drawn as the preview draws it, transparent and out of the page flow.
const props = defineProps<{ data: PresentationData }>()

let started: (reveal: RevealApi) => void
const ready = new Promise<RevealApi>((resolve) => {
  started = resolve
})
const presentation = useTemplateRef<{ sync: () => void }>('presentation')

/**
 * Shows each slide in turn and reads its overflow and its body. A measure that
 * a later one replaced stops at its next wait, before it moves the slides again.
 */
async function measure(current: () => boolean): Promise<LayoutReading[] | undefined> {
  const reveal = await ready
  await nextTick()
  if (!current())
    return undefined
  presentation.value?.sync()
  const readings: LayoutReading[] = []
  for (let h = 0; h < props.data.slides.length; h++) {
    reveal.slide(h, 0)
    await transitionsEnded(reveal)
    // Reading the layout starts the load of the fonts the slide draws.
    const slides = reveal.getSlidesElement()
    slides.getBoundingClientRect()
    await document.fonts.ready
    if (!current())
      return undefined
    const section = presentSection(reveal)
    readings.push(section
      ? { overflow: sectionOverflow(slides, section, reveal.getComputedSlideSize().height), ...bodyReading(section) }
      : { overflow: 0, bodySize: 0, textScale: 1, fill: 0, ratio: 1 })
  }
  return readings
}

defineExpose({ measure })
</script>

<template>
  <div
    class="layout-probe"
    aria-hidden="true"
    inert
  >
    <RevealPresentation
      ref="presentation"
      :theme="data.metadata.theme"
      :config="probeRevealConfig(data.metadata.reveal)"
      :lang="data.metadata.lang"
      :code="data.metadata.code"
      :controls="false"
      @ready="started"
    >
      <RevealSlides :presentation-data="data" />
    </RevealPresentation>
  </div>
</template>

<style scoped>
.layout-probe {
  position: fixed;
  top: 0;
  left: 0;
  z-index: -1;
  width: 100vw;
  height: 100vh;
  contain: strict;
  opacity: 0;
  pointer-events: none;
}
</style>
