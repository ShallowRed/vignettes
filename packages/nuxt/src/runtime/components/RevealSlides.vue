<script setup lang="ts">
import type { PresentationData } from '../types/presentation.ts'
import { buildComponentMap } from '@vignettes/core/deck'
import { getDefaultTheme } from '@vignettes/core/theme'
import { computed, provide, resolveComponent } from 'vue'
import { STORYBOOK_BASE } from '../config/injection-keys.ts'
import { getSlideClasses, resolveSlideBackground } from '../utils/slide-rendering.ts'

const props = defineProps<{ presentationData: PresentationData }>()

const { slideIdMap, getVerticalId } = useSlideIds(
  computed(() => props.presentationData?.slides ?? []),
)

// Share the deck's Storybook root so MDC components resolve a story id to a full iframe URL.
provide(
  STORYBOOK_BASE,
  computed(() => props.presentationData?.metadata?.storybook),
)

const mdcComponents: Record<string, any> = Object.fromEntries(
  Object.entries(buildComponentMap()).map(([key, componentName]) => [
    key,
    resolveComponent(componentName),
  ]),
)

// Reveal draws the background from these attributes. An overlay is black under
// the image, made that much transparent.
function backgroundAttrs(slide: { headingLevel?: string, backgroundImage?: string, backgroundOverlay?: number }) {
  return {
    'data-background-image': resolveSlideBackground(
      slide,
      props.presentationData.metadata.theme || getDefaultTheme(),
      props.presentationData.metadata.backgrounds,
    ),
    ...(slide.backgroundOverlay
      ? { 'data-background-color': '#000', 'data-background-opacity': String(1 - slide.backgroundOverlay) }
      : {}),
  }
}
</script>

<template>
  <template
    v-for="(section, index) in presentationData?.slides ?? []"
    :key="index"
  >
    <!-- Horizontal section with vertical slides. The wrapper is Reveal's stack,
         not a slide: it carries `stack-<level>` rather than `slide-<level>`, so a
         theme rule written for a heading level cannot reach, through descendant
         selectors, the slides nested inside. The section's own content is the
         first of its vertical slides and keeps its `slide-<level>` class. -->
    <section
      v-if="section.verticalSlides && section.verticalSlides.length > 0"
      :class="section.headingLevel ? `stack-${section.headingLevel}` : ''"
      v-bind="backgroundAttrs(section)"
    >
      <section
        v-for="(verticalSlide, vIndex) in section.verticalSlides"
        :id="getVerticalId(index, vIndex)"
        :key="`${index}-${vIndex}`"
        :data-markdown="false"
        :class="getSlideClasses(verticalSlide)"
        v-bind="backgroundAttrs(verticalSlide)"
      >
        <SlideContent
          :slide="verticalSlide"
          :metadata="presentationData.metadata"
          :mdc-components="mdcComponents"
        />
      </section>
    </section>

    <!-- Single horizontal slide -->
    <section
      v-else
      :id="slideIdMap[index]?.sectionId"
      :data-markdown="false"
      :class="getSlideClasses(section)"
      v-bind="backgroundAttrs(section)"
    >
      <SlideContent
        :slide="section"
        :metadata="presentationData.metadata"
        :mdc-components="mdcComponents"
      />
    </section>
  </template>
</template>

<!-- Engine-level slide structure lives in `themes/shared/` (compiled into every theme). -->
