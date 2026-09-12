<script setup lang="ts">
import type { PresentationMetadata, Slide } from '../types/presentation'
import MDCRenderer from '@nuxtjs/mdc/runtime/components/MDCRenderer.vue'
import { EMBED_SANDBOX, resolveSlideMedia } from '@vignettes/core/render'
import { computed } from 'vue'
import { getLayoutStrategy } from '../config/layouts'
import { quicklinkParts } from '../utils/slide-rendering'

const props = defineProps<{
  slide: Slide
  metadata: PresentationMetadata
  mdcComponents: Record<string, any>
}>()

const layoutStrategy = computed(() => getLayoutStrategy(props.slide.layout))

// Media pane resolution lives in the shared transform pipeline; null when no media.
const mediaParts = computed(() =>
  resolveSlideMedia(props.slide.layoutProps, { storybook: props.metadata?.storybook }))

const parsedQuicklink = computed(() => {
  if (!props.slide.quicklink)
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
      :body="slide.body"
      :data="metadata"
      :components="mdcComponents"
    />
  </template>

  <template v-else>
    <div class="slide-content-pane">
      <hgroup v-if="slide.header?.children?.length && (slide.pretitle || slide.subtitle)">
        <div
          v-if="slide.pretitle"
          class="slide-pretitle"
        >
          <MDCRenderer
            :body="slide.pretitle"
            :data="metadata"
            :components="mdcComponents"
          />
        </div>
        <div class="slide-heading">
          <MDCRenderer
            :body="slide.header"
            :data="metadata"
            :components="mdcComponents"
          />
        </div>
        <div
          v-if="slide.subtitle"
          class="slide-subtitle"
        >
          <MDCRenderer
            :body="slide.subtitle"
            :data="metadata"
            :components="mdcComponents"
          />
        </div>
      </hgroup>

      <header v-else-if="slide.header?.children?.length">
        <MDCRenderer
          :body="slide.header"
          :data="metadata"
          :components="mdcComponents"
        />
      </header>

      <article v-if="slide.body?.children?.length">
        <MDCRenderer
          :body="slide.body"
          :data="metadata"
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
        :src="mediaParts.src"
        :title="mediaParts.title"
        :sandbox="EMBED_SANDBOX"
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
