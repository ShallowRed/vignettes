<script setup lang="ts">
import type { PresentationData } from '../types/presentation.ts'
import { buildComponentMap } from '@vignettes/core/deck'
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

function getBackground(slide: { headingLevel?: string, backgroundImage?: string }) {
  return resolveSlideBackground(
    slide,
    props.presentationData.metadata.theme || 'minimal',
    props.presentationData.metadata.backgrounds,
  )
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
      :data-background-image="getBackground(section)"
    >
      <section
        v-for="(verticalSlide, vIndex) in section.verticalSlides"
        :id="getVerticalId(index, vIndex)"
        :key="`${index}-${vIndex}`"
        :data-markdown="false"
        :class="getSlideClasses(verticalSlide)"
        :data-background-image="getBackground(verticalSlide)"
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
      :data-background-image="getBackground(section)"
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
