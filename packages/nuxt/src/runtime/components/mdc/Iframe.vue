<script setup lang="ts">
import { useDeckMessages } from '../../composables/useDeckMessages.ts'
import { useFrameAttributes } from '../../composables/useFrameAttributes.ts'

interface Props {
  /**
   * Address of the page.
   * @fr Adresse de la page.
   */
  src: string
  /**
   * Accessible title of the frame.
   * @fr Titre du cadre, lu par les lecteurs d'écran.
   */
  title?: string
  /**
   * CSS width of the frame.
   * @fr Largeur CSS du cadre.
   */
  width?: string
  /**
   * CSS height of the frame.
   * @fr Hauteur CSS du cadre.
   */
  height?: string
  /**
   * Permissions policy of the frame, its `allow` attribute.
   * @fr Permissions accordées à la page du cadre, son attribut `allow`.
   */
  allow?: string
  /**
   * The `frameborder` attribute of the frame.
   * @fr L'attribut `frameborder` du cadre.
   */
  frameborder?: string
  /**
   * Stretches the frame to the width of its column.
   * @fr Étend le cadre à la largeur de sa colonne.
   */
  fullwidth?: boolean
  /**
   * Opens the page full-screen on click.
   * @fr Ouvre la page en plein écran au clic.
   */
  lightbox?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  width: '100%',
  height: '500px',
  allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
  frameborder: '0',
  fullwidth: true,
  lightbox: false,
})

const messages = useDeckMessages()
const frameAttributes = useFrameAttributes()
</script>

<template>
  <div
    class="iframe-container"
    :class="{ fullwidth: props.fullwidth }"
  >
    <a
      v-if="props.lightbox"
      :href="props.src"
      data-preview-link
      class="iframe-lightbox-link"
    >
      <iframe
        v-bind="frameAttributes(props.src)"
        :title="props.title"
        :style="{ width: props.width, height: props.height }"
        :allow="props.allow"
        :frameborder="props.frameborder"
      />
      <div class="expand-hint">
        <span>{{ messages.enlarge }}</span>
      </div>
    </a>
    <iframe
      v-else
      v-bind="frameAttributes(props.src)"
      :title="props.title"
      :style="{ width: props.width, height: props.height }"
      :allow="props.allow"
      :frameborder="props.frameborder"
      allowfullscreen
    />
  </div>
</template>

<style scoped>
.iframe-container {
  position: relative;
  width: 100%;
  border: 1px solid var(--border);
  overflow: hidden;
  box-shadow: var(--shadow, 0 2px 8px rgba(0, 0, 0, 0.12));
}

.iframe-container.fullwidth {
  width: 100%;
  border-radius: 0;
}

.iframe-container iframe {
  display: block;
  border: none;
  min-width: 100%;
}

.iframe-lightbox-link {
  display: block;
  position: relative;
  cursor: pointer;
}

.iframe-lightbox-link iframe {
  pointer-events: none;
}

.iframe-lightbox-link:hover .expand-hint {
  opacity: 1;
}

.expand-hint {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
  color: white;
  padding: 1rem;
  text-align: center;
  font-size: 0.9em;
  opacity: 0;
  transition: opacity 0.2s;
  pointer-events: none;
  z-index: 10;
}
</style>
