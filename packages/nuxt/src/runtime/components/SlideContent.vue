<script setup lang="ts">
import type { MDCRoot } from '@nuxtjs/mdc'
import type { PresentationMetadata, Slide } from '../types/presentation.ts'
import MDCRenderer from '@nuxtjs/mdc/runtime/components/MDCRenderer.vue'
import { isDeckUrl } from '@vignettes/core/deck'
import { resolveSlideMedia } from '@vignettes/core/render'
import { computed } from 'vue'
import { useFrameAttributes } from '../composables/useFrameAttributes.ts'
import { getLayoutStrategy } from '../config/layouts.ts'
import { keepKnownComponents, quicklinkParts } from '../utils/slide-rendering.ts'

const props = defineProps<{
  slide: Slide
  metadata: PresentationMetadata
  mdcComponents: Record<string, any>
}>()

const frameAttributes = useFrameAttributes()

const layoutStrategy = computed(() => getLayoutStrategy(props.slide.layout))

// The deck model carries the parsed trees as `unknown`, so it stays free of the
// renderer's types. This component is the renderer side, and names them once.
const known = computed(() => Object.keys(props.mdcComponents))
const rendered = (tree: unknown) => tree ? keepKnownComponents(tree as MDCRoot, known.value) : undefined
const body = computed(() => rendered(props.slide.body) as MDCRoot)
const header = computed(() => rendered(props.slide.header))
const pretitle = computed(() => rendered(props.slide.pretitle))
const subtitle = computed(() => rendered(props.slide.subtitle))

// MDCRenderer reads `component` of its data as the root element of the slide
// and `mdc.components` as a map of tags: a deck's frontmatter gives neither.
const renderData = computed(() => Object.fromEntries(
  Object.entries(props.metadata ?? {}).filter(([key]) => key !== 'component' && key !== 'mdc'),
))

// null when the slide has no media.
const mediaParts = computed(() =>
  resolveSlideMedia(props.slide.layoutProps, { storybook: props.metadata?.storybook }))

const parsedQuicklink = computed(() => {
  if (!props.slide.quicklink || !isDeckUrl(props.slide.quicklink.href))
    return null
  return {
    ...props.slide.quicklink,
    parts: quicklinkParts(props.slide.quicklink.text),
  }
})
</script>

<template>
  <template v-if="layoutStrategy === 'full'">
    <MDCRenderer
      :body="body"
      :data="renderData"
      :components="mdcComponents"
    />
  </template>

  <template v-else>
    <div class="slide-content-pane">
      <hgroup v-if="header?.children?.length && (pretitle || subtitle)">
        <div
          v-if="pretitle"
          class="slide-pretitle"
        >
          <MDCRenderer
            :body="pretitle"
            :data="renderData"
            :components="mdcComponents"
          />
        </div>
        <div class="slide-heading">
          <MDCRenderer
            :body="header"
            :data="renderData"
            :components="mdcComponents"
          />
        </div>
        <div
          v-if="subtitle"
          class="slide-subtitle"
        >
          <MDCRenderer
            :body="subtitle"
            :data="renderData"
            :components="mdcComponents"
          />
        </div>
      </hgroup>

      <header v-else-if="header?.children?.length">
        <MDCRenderer
          :body="header"
          :data="renderData"
          :components="mdcComponents"
        />
      </header>

      <article v-if="body?.children?.length">
        <MDCRenderer
          :body="body"
          :data="renderData"
          :components="mdcComponents"
        />
      </article>

      <p
        v-if="mediaParts?.hint"
        class="slide-media-hint"
      >
        {{ mediaParts.hint }}
      </p>
    </div>

    <aside
      v-if="mediaParts"
      class="slide-media-pane"
      :class="[
        `fit-${mediaParts.fit}`,
        { 'has-lightbox': mediaParts.hasLightbox, 'is-scaled': mediaParts.scaled, 'is-interactive': mediaParts.interactive },
      ]"
      :style="mediaParts.scaled ? { '--preview-width': `${mediaParts.previewWidth}px` } : undefined"
      :data-preview-link="mediaParts.previewLink"
      :data-preview-image="mediaParts.previewImage"
    >
      <iframe
        v-if="mediaParts.type === 'iframe'"
        v-bind="frameAttributes(mediaParts.src)"
        :title="mediaParts.title"
        frameborder="0"
        allowfullscreen
      />
      <img
        v-else
        :src="mediaParts.src"
        :class="`fit-${mediaParts.fit}`"
        :alt="mediaParts.alt"
      >
    </aside>

    <div
      v-if="parsedQuicklink"
      class="slide-quicklink-wrapper"
    >
      <template v-if="parsedQuicklink.parts">
        <span class="slide-quicklink-prefix">{{ parsedQuicklink.parts.prefix }}</span>
        <a
          :href="parsedQuicklink.href"
          class="slide-quicklink"
        >{{ parsedQuicklink.parts.label }} →</a>
      </template>
      <a
        v-else
        :href="parsedQuicklink.href"
        class="slide-quicklink"
      >{{ parsedQuicklink.text }} →</a>
    </div>
  </template>
</template>

<style scoped>
/* Slide structure lives in themes/shared/_reveal-patches.scss (shared with media-layout rules). */
</style>
