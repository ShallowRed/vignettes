<script setup lang="ts">
import type { RevealConfig } from '../types/presentation.ts'
import { buildPrintPdfUrl, buildPrintView, codeThemeStyle, mergeRevealConfig, PRINT_PDF_QUERY } from '@vignettes/core/render'
import { computed, nextTick, onMounted, onUnmounted, provide, ref, toRef } from 'vue'
import DeckControls from './DeckControls.vue'
import 'reveal.js/dist/reveal.css'
// With `?print-pdf` in the URL, Reveal adds `reveal-print` to <html> and this
// stylesheet lays the deck out one slide per page.
import 'reveal.js/css/print/pdf.scss'

interface Props {
  theme?: string
  config?: Partial<RevealConfig>
  /** Deck language (frontmatter `lang`); French orthotypography applies only to French decks. */
  lang?: string
  /** Code theme of the deck (frontmatter `code`): a theme name, or theme properties. */
  code?: unknown
  /**
   * Show the commands bar. Off for the editor preview, where the bar would sit on
   * the editor header and its commands act on the whole page.
   */
  controls?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  theme: 'dsfr',
  controls: true,
})

const emit = defineEmits<{
  /** Reveal is initialized; the host can bind keys or listen to slide changes. */
  ready: [reveal: any]
}>()

const revealContainer = ref<HTMLElement | null>(null)

// The code theme sets CSS variables on the deck root, read by the theme stylesheet.
const codeStyle = computed(() => codeThemeStyle(props.code))

const frenchTypography = computed(() => !props.lang || props.lang.toLowerCase().startsWith('fr'))

// A `?print-pdf` load is detected at setup, before Reveal initializes, so the
// print config (full-page layout, one slide per page) applies from the start.
const isPrintMode = import.meta.client
  && new RegExp(PRINT_PDF_QUERY, 'i').test(window.location.search)

const effectiveConfig = isPrintMode
  ? buildPrintView({ meta: { reveal: props.config }, slides: [], assets: [] }, {
    deckUrl: window.location.href,
  }).reveal
  : (props.config || {})

function openPrintView() {
  window.location.href = buildPrintPdfUrl(window.location.href)
}

const exitPrintUrl = computed(() => {
  if (!import.meta.client)
    return ''
  const url = new URL(window.location.href)
  url.searchParams.delete(PRINT_PDF_QUERY)
  return `${url.pathname}${url.search}${url.hash}`
})

function reopenPrintDialog() {
  window.print()
}

// Serialised onto `.reveal` so the frozen prerendered bundle can init Reveal with
// the deck's frontmatter `reveal:` config, not just defaults.
const resolvedRevealConfig = computed(() =>
  JSON.stringify(mergeRevealConfig(props.config)))

const { themeReady } = useTheme(toRef(props, 'theme'))

// The veil covers the deck until Reveal has laid it out with the theme and its
// fonts, so the reader never sees the unstyled slides or the change of scale.
// After 4 seconds it lifts anyway, so a failed stylesheet or font leaves the
// deck readable.
const ready = ref(false)
const VEIL_MAX_MS = 4000

// The bar is interactive only, so it renders once mounted: a frozen bundle, which
// has no Vue runtime, shows no inert button.
const mounted = ref(false)

const { initialize, destroy, getInstance, sync, slide, getIndices } = useReveal(revealContainer, effectiveConfig)

// Let MDC components trigger a Reveal sync after dynamic content changes.
provide('revealSync', sync)
provide('revealInstance', getInstance)

// The integrated editor drives the preview to the slide under the cursor.
defineExpose({ slide, getIndices, getInstance, sync })

// Translate markdown anchor clicks (href="#slug") into Reveal hash navigation (#/slug).
function handleAnchorClick(event: MouseEvent) {
  const link = (event.target as Element).closest('a[href^="#"]')
  if (!link)
    return
  const href = link.getAttribute('href')
  if (!href || href === '#')
    return
  const slug = href.slice(1)
  const target = revealContainer.value?.querySelector(`section[id="${CSS.escape(slug)}"]`)
  if (!target)
    return
  event.preventDefault()
  window.location.hash = `/${slug}`
}

onMounted(async () => {
  mounted.value = true
  const liftTimer = setTimeout(() => ready.value = true, VEIL_MAX_MS)
  await Promise.all([initialize(), themeReady()])
  await document.fonts.ready
  clearTimeout(liftTimer)
  ready.value = true
  if (getInstance())
    emit('ready', getInstance())
  revealContainer.value?.addEventListener('click', handleAnchorClick)

  // Reveal computes its print pagination during initialize(), but the Vue/MDC
  // slide bodies render *after* mount — so the first print layout sees a deck
  // that isn't filled in yet. Once content has settled, sync + re-layout so each
  // slide is paginated against its real height, then open the browser's print
  // dialog: Reveal's print layout is meant for the paged-print medium (on screen
  // the pages sit off-viewport), so we hand straight to Save-as-PDF rather than
  // leave the user on a blank-looking page. Two frames: one for Vue to flush the
  // slot, one for the browser to apply the resulting sizes.
  if (isPrintMode) {
    await nextTick()
    requestAnimationFrame(() => requestAnimationFrame(() => {
      sync()
      getInstance()?.layout()
      // A further frame so the re-layout paints before the (blocking) dialog.
      requestAnimationFrame(() => window.print())
    }))
  }
})

onUnmounted(() => {
  revealContainer.value?.removeEventListener('click', handleAnchorClick)
  destroy()
})
</script>

<template>
  <div
    ref="revealContainer"
    v-french-typography="frenchTypography"
    class="reveal"
    :style="codeStyle"
    :data-reveal-config="resolvedRevealConfig"
  >
    <!-- The veil precedes the slides so the browser paints it before them. -->
    <div
      class="deck-veil"
      :class="{ 'deck-veil--lifted': ready }"
      role="status"
    >
      <span
        class="deck-veil__mark"
        aria-hidden="true"
      ><i /><i /><i /></span>
      <span class="deck-veil__label">Chargement de la présentation</span>
    </div>
    <div class="slides">
      <slot />
    </div>
    <!-- On screen, Reveal's print layout sits off-viewport (it targets the paged
         print medium), so without this the page looks blank. Screen-only; hidden
         in the actual print render via @media print. -->
    <div
      v-if="isPrintMode"
      class="print-overlay"
    >
      <p>Préparation de l’export PDF…</p>
      <p class="print-overlay__hint">
        La fenêtre d’impression s’ouvre automatiquement — choisissez « Enregistrer en PDF ».
      </p>
      <button
        type="button"
        class="print-overlay__btn"
        @click="reopenPrintDialog"
      >
        Rouvrir la fenêtre d’impression
      </button>
      <a
        class="print-overlay__btn print-overlay__btn--ghost"
        :href="exitPrintUrl"
      >
        Revenir à la présentation
      </a>
    </div>
    <DeckControls
      v-if="mounted && controls && !isPrintMode"
      :get-instance="getInstance"
      @print="openPrintView"
    >
      <template
        v-if="$slots['controls-before']"
        #before
      >
        <slot name="controls-before" />
      </template>
      <template
        v-if="$slots['controls-after']"
        #after
      >
        <slot name="controls-after" />
      </template>
    </DeckControls>
  </div>
</template>

<style scoped>
.reveal {
  width: 100%;
  height: 100vh;
}

.deck-veil {
  position: absolute;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  background: var(--surface, #fff);
  transition: opacity 150ms ease, visibility 0s linear 150ms;
}

.deck-veil--lifted {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
}

/* Three panels that fill one after the other, shown only after a second so a
   fast load shows a plain surface. */
.deck-veil__mark {
  display: grid;
  grid-template-columns: 14fr 8fr 6fr;
  gap: 4px;
  width: 64px;
  height: 36px;
  opacity: 0;
  animation: deck-veil-appear 200ms ease 1s forwards;
}

.deck-veil__mark i {
  background: var(--accent, #000091);
  opacity: 0.18;
  animation: deck-veil-fill 1200ms ease-in-out infinite;
}

.deck-veil__mark i:nth-child(2) {
  animation-delay: 200ms;
}

.deck-veil__mark i:nth-child(3) {
  animation-delay: 400ms;
}

.deck-veil--lifted .deck-veil__mark i {
  animation-play-state: paused;
}

.deck-veil__label {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

@keyframes deck-veil-fill {
  30%,
  60% {
    opacity: 1;
  }
}

@keyframes deck-veil-appear {
  to {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .deck-veil {
    transition: none;
  }

  .deck-veil__mark {
    animation: deck-veil-appear 0s linear 1s forwards;
  }

  .deck-veil__mark i {
    opacity: 1;
    animation: none;
  }
}

.print-overlay {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 2rem;
  text-align: center;
  color: #1a1a1a;
  background: #fff;
}

.print-overlay p {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
}

.print-overlay__hint {
  max-width: 32rem;
  font-size: 0.95rem !important;
  font-weight: 400 !important;
  color: #555;
}

.print-overlay__btn {
  margin-top: 0.5rem;
  padding: 0.5rem 1.1rem;
  font: inherit;
  color: #fff;
  text-decoration: none;
  cursor: pointer;
  background: #1a1a1a;
  border: 1px solid #1a1a1a;
  border-radius: 0.4rem;
}

.print-overlay__btn--ghost {
  color: #1a1a1a;
  background: transparent;
}

/* Never let on-screen controls bleed into the print/PDF render. */
@media print {
  .print-overlay,
  .deck-veil {
    display: none !important;
  }
}
</style>
