<script setup lang="ts">
import { DEFAULT_MEDIA_VIEWPORT, inferMediaType } from '@vignettes/core/deck'
import { useDeckMessages } from '@vignettes/nuxt/deck-messages'
import { useFrameAttributes } from '@vignettes/nuxt/frame-attributes'
import { STORYBOOK_BASE } from '@vignettes/nuxt/injection-keys'
import { computed, inject } from 'vue'
import { buildStoryUrl, resolveAspectRatio } from '../storybook.ts'

// Embeds a Storybook story (by id, resolved against the deck's `storybook` root) or an
// arbitrary iframe/image. Iframes render at a logical width (`viewport`) and scale down
// to fit, so the whole page is visible rather than the top-left corner at 1:1.
interface Props {
  /**
   * Storybook story id (`<componentId>--<storyName>`).
   * @fr Identifiant de la story Storybook (`<componentId>--<storyName>`).
   */
  story?: string
  /**
   * Explicit URL, used when `story` is absent.
   * @fr Adresse à afficher quand `story` est absent.
   */
  src?: string
  /**
   * Kind of media; without it, a story or an address is a page, and an address that ends with an image extension an image.
   * @fr Nature du média ; sans lui, une story ou une adresse est une page, et une adresse qui finit par une extension d'image est une image.
   */
  type?: 'iframe' | 'image'
  /**
   * CSS `object-fit` of an image in the frame.
   * @fr `object-fit` CSS d'une image dans le cadre.
   */
  fit?: 'cover' | 'contain'
  /**
   * Aspect ratio: a name (`desktop` 16/10, `wide` 16/9, `classic` 4/3, `photo` 3/2, `square`, `mobile` 9/16, `portrait` 3/4) or a ratio such as `16/9`. Without it, the frame is `wide` outside a gallery, and fills its room on a `:layout{screen}` slide.
   * @fr Proportions : un nom (`desktop` 16/10, `wide` 16/9, `classic` 4/3, `photo` 3/2, `square`, `mobile` 9/16, `portrait` 3/4) ou un rapport comme `16/9`. Sans lui, le cadre est en `wide` hors d'une galerie, et remplit sa place sur une diapositive `:layout{screen}`.
   */
  ratio?: string
  /**
   * Logical width (px) the iframe renders at before scaling; a higher value shows more of the page.
   * @fr Largeur en px à laquelle la page est affichée avant d'être réduite ; plus elle est grande, plus on voit de la page.
   */
  viewport?: string | number
  /**
   * Another name of `viewport`, read in the existing presentations.
   * @fr Autre nom de `viewport`, lu dans les présentations existantes.
   */
  previewWidth?: string | number
  /**
   * Renders the frame at its native size, without scaling.
   * @fr Affiche le cadre à sa taille réelle, sans le réduire.
   */
  raw?: boolean
  /**
   * Caption under the frame; overrides the default slot.
   * @fr Légende sous le cadre ; remplace le contenu du bloc.
   */
  label?: string
  /**
   * Opens the screen full-screen on click.
   * @fr Ouvre l'écran en plein écran au clic.
   */
  lightbox?: boolean
  /**
   * Accessible title of the frame, or the text alternative of an image.
   * @fr Titre du cadre lu par les lecteurs d'écran, ou texte de remplacement d'une image.
   */
  title?: string
  /**
   * Lets the frame grow to fill the available height, in a gallery.
   * @fr Laisse le cadre prendre toute la hauteur disponible, dans une galerie.
   */
  grow?: boolean
  /**
   * Incentive text shown beside the frame to invite interaction.
   * @fr Texte affiché à côté du cadre pour inviter à l'utiliser.
   */
  hint?: string
}

const props = withDefaults(defineProps<Props>(), {
  fit: 'cover',
  raw: false,
  lightbox: false,
  grow: false,
})

defineSlots<{
  /** The caption under the frame, in markdown. */
  default?: () => unknown
}>()

const messages = useDeckMessages()
const frameAttributes = useFrameAttributes()

const storybookBase = inject(STORYBOOK_BASE, undefined)

const resolvedSrc = computed(() => {
  if (props.story)
    return buildStoryUrl(storybookBase?.value, props.story) ?? props.src
  return props.src
})

const isIframe = computed(() =>
  inferMediaType(resolvedSrc.value ?? '', props.type, Boolean(props.story)) === 'iframe')

// An iframe has no height of its own: a frame that does not grow takes `wide`
// without a ratio (the default of `.story-frame__media`).
const aspect = computed(() => resolveAspectRatio(props.ratio))
const missing = computed(() => !resolvedSrc.value)

// Width exposed as `--preview-width`; scaled-frame.js reads it to size the iframe
// (cross-browser, unlike CSS cqh in Firefox — see _media-layouts.scss).
const viewportWidth = computed(() => {
  const width = props.viewport ?? props.previewWidth
  const n = typeof width === 'string' ? Number.parseInt(width, 10) : width
  return n && Number.isFinite(n) && n > 0 ? n : DEFAULT_MEDIA_VIEWPORT
})
const scalingEnabled = computed(() => isIframe.value && !props.raw)
const scaledFrameStyle = computed(() =>
  scalingEnabled.value ? { '--preview-width': `${viewportWidth.value}px` } : undefined)
</script>

<template>
  <figure
    class="story-frame"
    :class="[`fit-${props.fit}`, { 'grow': props.grow, 'has-lightbox': props.lightbox, 'has-ratio': aspect, 'has-caption': props.label || $slots.default, 'has-hint': props.hint }]"
  >
    <div
      class="story-frame__media"
      :class="{ 'is-scaled': scalingEnabled }"
      :style="[aspect ? { '--frame-ratio': aspect } : {}, scaledFrameStyle || {}]"
    >
      <p
        v-if="missing"
        class="story-frame__missing"
      >
        {{ messages.storyMissing }}
      </p>

      <a
        v-else-if="isIframe && props.lightbox"
        :href="resolvedSrc"
        data-preview-link
        class="story-frame__lightbox"
      >
        <iframe
          v-bind="frameAttributes(resolvedSrc)"
          :title="props.title || props.label || 'Story'"
          frameborder="0"
        />
        <span class="story-frame__hint">{{ messages.enlarge }}</span>
      </a>

      <iframe
        v-else-if="isIframe"
        v-bind="frameAttributes(resolvedSrc)"
        :title="props.title || props.label || 'Story'"
        frameborder="0"
        allowfullscreen
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
  --frame-gap: 0.5rem;
  --caption-size: 0.6em;
  --caption-leading: 1.3;
  --hint-offset: 0.3rem;
  --hint-size: 0.55em;
  --hint-leading: 1.35;
  display: flex;
  flex-direction: column;
  gap: var(--frame-gap);
  margin: 0;
  min-width: 0;
  min-height: 0;
}

/* A frame that grows, as every frame on a `:layout{screen}` slide, takes the
   room its container leaves. */
.story-frame.grow,
.reveal section.layout-screen .story-frame {
  flex: 1 1 0;
  height: 100%;
}

.story-frame__media {
  position: relative;
  width: 100%;
  aspect-ratio: var(--frame-ratio, 16 / 9);
  overflow: hidden;
  background: var(--surface);
  --text-title: var(--on-surface-title);
  --text-default: var(--on-surface-default);
  --text-mention: var(--on-surface-mention);
  border: 1px solid var(--border);
  box-shadow: var(--shadow, 0 2px 8px rgba(0, 0, 0, 0.12));
}

.story-frame.grow .story-frame__media,
.reveal section.layout-screen .story-frame:not(.has-ratio) .story-frame__media {
  flex: 1 1 0;
  height: 100%;
  aspect-ratio: var(--frame-ratio, auto);
}

/* `:layout{screen}`: with a ratio, the screen is the largest box at that ratio
   that leaves the room of its caption and its hint, each on one line. */
.reveal section.layout-screen .story-frame {
  justify-content: center;
}

.reveal section.layout-screen .story-frame.has-ratio {
  container-type: size;
  align-items: center;
}

.reveal section.layout-screen .story-frame.has-caption {
  --caption-space: calc(var(--frame-gap) + var(--caption-size) * var(--caption-leading));
}

.reveal section.layout-screen .story-frame.has-hint {
  --hint-space: calc(var(--frame-gap) + var(--hint-offset) + var(--hint-size) * var(--hint-leading));
}

.reveal section.layout-screen .story-frame.has-ratio .story-frame__media {
  box-sizing: border-box;
  width: min(100cqw, (100cqh - var(--caption-space, 0px) - var(--hint-space, 0px)) * var(--frame-ratio));
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
  font-size: var(--caption-size);
  line-height: var(--caption-leading);
  color: var(--text-mention);
  text-align: center;
}

.story-frame__hint-beside {
  margin: var(--hint-offset) 0 0;
  font-size: var(--hint-size);
  line-height: var(--hint-leading);
  color: var(--text-mention);
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
  color: var(--text-mention);
}
</style>
