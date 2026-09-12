<script setup lang="ts">
import type { RevealConfig } from '~/types/presentation'
import { buildPrintPdfUrl, buildPrintView, mergeRevealConfig, PRINT_PDF_QUERY } from '@vignettes/core/render'
import 'reveal.js/dist/reveal.css'
// With `?print-pdf` in the URL, Reveal adds `reveal-print` to <html> and this
// stylesheet lays the deck out one slide per page.
import 'reveal.js/css/print/pdf.scss'

interface Props {
  theme?: string
  config?: Partial<RevealConfig>
  /** Deck language (frontmatter `lang`); French orthotypography applies only to French decks. */
  lang?: string
  /**
   * Show the print/PDF button. Off for the editor preview: the button is fixed to
   * the viewport, where it lands on the editor header, and it sends the CURRENT
   * url to `?print-pdf`, which only makes sense on a deck page.
   */
  printButton?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  theme: 'dsfr',
  printButton: true,
})

const revealContainer = ref<HTMLElement | null>(null)

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

const { loadTheme, unloadTheme, watchTheme } = useTheme(toRef(props, 'theme'))

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
  loadTheme(props.theme)
  watchTheme()
  await initialize()
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
  unloadTheme()
})
</script>

<template>
  <div
    ref="revealContainer"
    v-french-typography="frenchTypography"
    class="reveal"
    :data-reveal-config="resolvedRevealConfig"
  >
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
    <button
      v-if="!isPrintMode && printButton"
      type="button"
      class="print-pdf-button"
      title="Imprimer / exporter en PDF"
      aria-label="Imprimer ou exporter en PDF"
      @click="openPrintView"
    >
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        aria-hidden="true"
        focusable="false"
      >
        <path
          fill="currentColor"
          d="M16 3a1 1 0 0 1 1 1v3h2a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-2v2a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2V4a1 1 0 0 1 1-1zm-1 14H9v3h6zm4-8H5v6h2v-1a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v1h2zm-2 1.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2M15 5H9v2h6z"
        />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.reveal {
  width: 100%;
  height: 100vh;
}

.print-pdf-button {
  position: fixed;
  top: 0.75rem;
  right: 0.75rem;
  z-index: 50;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  padding: 0;
  color: #fff;
  background: rgba(0, 0, 0, 0.45);
  border: none;
  border-radius: 0.4rem;
  cursor: pointer;
  opacity: 0.35;
  transition: opacity 0.15s ease, background 0.15s ease;
}

.print-pdf-button:hover,
.print-pdf-button:focus-visible {
  opacity: 1;
  background: rgba(0, 0, 0, 0.7);
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
  .print-pdf-button,
  .print-overlay {
    display: none !important;
  }
}
</style>
