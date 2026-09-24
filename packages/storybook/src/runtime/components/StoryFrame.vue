<script setup lang="ts">
import { inferMediaType } from '@vignettes/core/render'
import { useDeckMessages } from '@vignettes/nuxt/runtime/composables/useDeckMessages.ts'
import { useFrameSource } from '@vignettes/nuxt/runtime/composables/useFrameSource.ts'
import { STORYBOOK_BASE } from '@vignettes/nuxt/runtime/config/injection-keys.ts'
import { computed, inject } from 'vue'
import { buildStoryUrl, EMBED_SANDBOX, resolveAspectRatio } from '../storybook.ts'

// Embeds a Storybook story (by id, resolved against the deck's `storybook` root) or an
// arbitrary iframe/image. Iframes render at a logical width (`previewWidth`) and scale down
// to fit, so the whole page is visible rather than the top-left corner at 1:1.
interface Props {
  /** Storybook story id (`<componentId>--<storyName>`). */
  story?: string
  /** Explicit URL, used when `story` is absent. */
  src?: string
  type?: 'iframe' | 'image'
  fit?: 'cover' | 'contain'
  /** Named (`desktop`, `wide`, `mobile`…) or raw `16/9`. */
  ratio?: string
  /** Logical width (px) the iframe renders at before scaling; higher = more of the page visible. */
  previewWidth?: string | number
  /** Render the iframe at native size (1:1), no scaling. */
  raw?: boolean
  /** Caption under the frame; overrides the default slot. */
  label?: string
  lightbox?: boolean
  title?: string
  /** Let the frame grow to fill available height (galleries). */
  grow?: boolean
  /** Incentive text shown beside the frame to invite interaction. */
  hint?: string
}

const props = withDefaults(defineProps<Props>(), {
  fit: 'cover',
  previewWidth: 1440,
  raw: false,
  lightbox: false,
  grow: false,
})

const messages = useDeckMessages()
const frameSource = useFrameSource()

const storybookBase = inject(STORYBOOK_BASE, undefined)

const resolvedSrc = computed(() => {
  if (props.story)
    return buildStoryUrl(storybookBase?.value, props.story) ?? props.src
  return props.src
})

const isIframe = computed(() =>
  inferMediaType(resolvedSrc.value ?? '', props.type, Boolean(props.story)) === 'iframe')

const aspect = computed(() => resolveAspectRatio(props.ratio))
const missing = computed(() => !resolvedSrc.value)

// Width exposed as `--preview-width`; scaled-frame.js reads it to size the iframe
// (cross-browser, unlike CSS cqh in Firefox — see _media-layouts.scss).
const previewWidthNum = computed(() => {
  const n = typeof props.previewWidth === 'string'
    ? Number.parseInt(props.previewWidth, 10)
    : props.previewWidth
  return n && Number.isFinite(n) && n > 0 ? n : 1440
})
const scalingEnabled = computed(() => isIframe.value && !props.raw)
const scaledFrameStyle = computed(() =>
  scalingEnabled.value ? { '--preview-width': `${previewWidthNum.value}px` } : undefined)
</script>

<template>
  <figure
    class="story-frame"
    :class="[`fit-${props.fit}`, { 'grow': props.grow, 'has-lightbox': props.lightbox }]"
  >
    <div
      class="story-frame__media"
      :class="{ 'is-scaled': scalingEnabled }"
      :style="[aspect ? { aspectRatio: aspect } : {}, scaledFrameStyle || {}]"
    >
      <p
        v-if="missing"
        class="story-frame__missing"
      >
        Aucune source : renseigner <code>story</code> (+ <code>storybook</code> en frontmatter) ou <code>src</code>.
      </p>

      <a
        v-else-if="isIframe && props.lightbox"
        :href="resolvedSrc"
        data-preview-link
        class="story-frame__lightbox"
      >
        <iframe
          v-bind="frameSource(resolvedSrc)"
          :title="props.title || props.label || 'Story'"
          :sandbox="EMBED_SANDBOX"
          frameborder="0"
          data-preload
        />
        <span class="story-frame__hint">{{ messages.enlarge }}</span>
      </a>

      <iframe
        v-else-if="isIframe"
        v-bind="frameSource(resolvedSrc)"
        :title="props.title || props.label || 'Story'"
        :sandbox="EMBED_SANDBOX"
        frameborder="0"
        allowfullscreen
        data-preload
      />

      <img
        v-else
        :src="resolvedSrc"
        :alt="props.title || props.label || ''"
        :class="`fit-${props.fit}`"
        :data-preview-image="props.lightbox ? resolvedSrc : undefined"
      >
    </div>

    <p
      v-if="props.hint"
      class="story-frame__hint-beside"
    >
      {{ props.hint }}
    </p>

    <figcaption
      v-if="props.label || $slots.default"
      class="story-frame__caption"
    >
      <template v-if="props.label">
        {{ props.label }}
      </template>
      <slot v-else />
    </figcaption>
  </figure>
</template>

<style scoped>
.story-frame {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0;
  min-width: 0;
  min-height: 0;
}

.story-frame.grow {
  flex: 1 1 0;
  height: 100%;
}

.story-frame__media {
  position: relative;
  width: 100%;
  overflow: hidden;
  background: var(--surface, #fff);
  border: 1px solid var(--border, #e0e0e0);
  box-shadow: var(--shadow, 0 2px 8px rgba(0, 0, 0, 0.12));
}

.story-frame.grow .story-frame__media {
  flex: 1 1 0;
  height: 100%;
}

.story-frame__media iframe {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 100%;
  border: none;
}

/* Scaled iframes are sized by scaled-frame.js, not CSS; this only sets the clip box + anchor. */
.story-frame__media.is-scaled {
  --preview-width: 1440px;
  position: relative;
  overflow: hidden;
}
.story-frame__media.is-scaled iframe {
  position: absolute;
  top: 0;
  left: 0;
  /* Pre-paint fallback before scaled-frame.js runs, avoiding an unscaled flash. */
  width: 100%;
  height: 100%;
  min-height: 0;
  transform-origin: top left;
}

.story-frame.fit-contain .story-frame__media {
  background: transparent;
  border: none;
  box-shadow: none;
}

.story-frame__media img {
  display: block;
  width: 100%;
  height: 100%;
}

.story-frame__media img.fit-cover {
  object-fit: cover;
}

.story-frame__media img.fit-contain {
  object-fit: contain;
}

.story-frame__lightbox {
  display: block;
  width: 100%;
  height: 100%;
  cursor: pointer;
}

.story-frame__lightbox iframe {
  pointer-events: none;
}

.story-frame__hint {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 0.6rem;
  text-align: center;
  font-size: 0.6em;
  color: #fff;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.65));
  opacity: 0;
  transition: opacity 0.2s;
  z-index: 2;
}

.story-frame__lightbox:hover .story-frame__hint {
  opacity: 1;
}

.story-frame__caption {
  font-size: 0.6em;
  line-height: 1.3;
  color: var(--text-mention, #6b6b6b);
  text-align: center;
}

.story-frame__hint-beside {
  margin: 0.3rem 0 0;
  font-size: 0.55em;
  line-height: 1.35;
  color: var(--text-mention, #6b6b6b);
  text-align: center;
  pointer-events: none;
}

.story-frame__hint-beside::before {
  content: '↑ ';
  opacity: 0.7;
}

.story-frame__missing {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 1rem;
  font-size: 0.55em;
  color: var(--text-mention, #888);
}
</style>
