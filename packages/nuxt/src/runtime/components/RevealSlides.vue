<script setup lang="ts">
import type { PresentationData, Slide } from '../types/presentation.ts'
import { buildComponentMap } from '@vignettes/core/deck'
import { behindMedia, deckBrand, showsBrand } from '@vignettes/core/render'
import { getDefaultTheme } from '@vignettes/core/theme'
import { computed, provide, resolveComponent } from 'vue'
import { useSlideErrorBoundary } from '../composables/useSlideErrorBoundary.ts'
import { useSlideIds } from '../composables/useSlideIds.ts'
import { STORYBOOK_BASE } from '../config/injection-keys.ts'
import { proseComponents } from '../utils/prose-components.ts'
import { getSlideClasses, knownComponentNames, resolveSlideBackground, slideKeys } from '../utils/slide-rendering.ts'

const props = defineProps<{ presentationData: PresentationData }>()

const { slideIdMap, getVerticalId } = useSlideIds(
  computed(() => props.presentationData?.slides ?? []),
)

// Share the deck's Storybook root so MDC components resolve a story id to a full iframe URL.
provide(
  STORYBOOK_BASE,
  computed(() => props.presentationData?.metadata?.storybook),
)

const keys = computed(() => slideKeys(props.presentationData?.slides ?? []))

const brand = computed(() => {
  const metadata = props.presentationData?.metadata ?? {}
  return deckBrand({ ...metadata, theme: metadata.theme || getDefaultTheme() })
})
function branded(index: number, vIndex = 0): boolean {
  return showsBrand(brand.value, props.presentationData?.slides ?? [], index, vIndex)
}
// A theme reserves above the content of the slide the height of the bloc
// marque, which grows with the lines of its title.
const brandStyle = computed(() => brand.value ? { '--slide-brand-lines': brand.value.lines.length } : undefined)

// A name outside the component map is a heading, rendered as a plain element.
const componentMap = buildComponentMap()
const mdcComponents: Record<string, any> = {
  ...proseComponents,
  ...Object.fromEntries(
    knownComponentNames().map(name => [name, componentMap[name] ? resolveComponent(componentMap[name]) : name]),
  ),
}

useSlideErrorBoundary(mdcComponents)

// Reveal draws the background from these attributes. A media behind the text
// keeps its framing, and its veil is black under the image, made that much
// transparent.
function backgroundAttrs(slide: Pick<Slide, 'headingLevel' | 'section' | 'backgroundImage' | 'layout'>) {
  const behind = behindMedia(slide)
  return {
    'data-background-image': resolveSlideBackground(
      slide,
      props.presentationData.metadata.theme || getDefaultTheme(),
      props.presentationData.metadata.backgrounds,
    ),
    ...(behind ? { 'data-background-size': behind.fit, 'data-background-position': behind.position } : {}),
    ...(behind?.veil
      ? { 'data-background-color': '#000', 'data-background-opacity': String(1 - behind.veil) }
      : {}),
  }
}
</script>

<template>
  <template
    v-for="(section, index) in presentationData?.slides ?? []"
    :key="keys.sections[index]"
  >
    <!-- Horizontal section with vertical slides. The wrapper is Reveal's stack,
         not a slide: it carries `stack-<level>` and no `slide-<role>` class, so a
         theme rule written for a slide role cannot reach, through descendant
         selectors, the slides nested inside. The section's own content is the
         first of its vertical slides and keeps its `slide-<role>` class. -->
    <section
      v-if="section.verticalSlides && section.verticalSlides.length > 0"
      :class="section.headingLevel ? `stack-${section.headingLevel}` : ''"
      v-bind="backgroundAttrs(section)"
    >
      <section
        v-for="(verticalSlide, vIndex) in section.verticalSlides"
        :id="getVerticalId(index, vIndex)"
        :key="keys.vertical[index]?.[vIndex]"
        :data-markdown="false"
        :class="[...getSlideClasses(verticalSlide), { 'has-brand': branded(index, vIndex) }]"
        :style="branded(index, vIndex) ? brandStyle : undefined"
        v-bind="backgroundAttrs(verticalSlide)"
      >
        <SlideBrand
          v-if="brand && branded(index, vIndex)"
          :brand="brand"
        />
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
      :class="[...getSlideClasses(section), { 'has-brand': branded(index) }]"
      :style="branded(index) ? brandStyle : undefined"
      v-bind="backgroundAttrs(section)"
    >
      <SlideBrand
        v-if="brand && branded(index)"
        :brand="brand"
      />
      <SlideContent
        :slide="section"
        :metadata="presentationData.metadata"
        :mdc-components="mdcComponents"
      />
    </section>
  </template>
</template>

<!-- Engine-level slide structure lives in `themes/shared/` (compiled into every theme). -->
