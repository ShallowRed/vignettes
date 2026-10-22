<script setup lang="ts">
import type { RevealApi } from 'reveal.js'
import type { RevealConfig } from '../types/presentation.ts'
import { useRequestURL } from '#imports'
import { buildPrintPdfUrl, buildPrintView, codeThemeStyle, deckMessages, mergeRevealConfig, PRINT_PDF_QUERY } from '@vignettes/core/render'
import { getDefaultTheme, getThemeTokens } from '@vignettes/core/theme'
import { computed, onMounted, onUnmounted, provide, ref } from 'vue'
import { useReveal } from '../composables/useReveal.ts'
import { useTheme } from '../composables/useTheme.ts'
import { DECK_MESSAGES_KEY } from '../config/injection-keys.ts'
import DeckControls from './DeckControls.vue'
import 'reveal.js/dist/reveal.css'
import '../assets/code-theme.css'
// With `?print-pdf` in the URL, Reveal adds `reveal-print` to <html> and this
// stylesheet lays the deck out one slide per page.
import 'reveal.js/css/print/pdf.scss'

interface Props {
  theme?: string
  config?: Partial<RevealConfig>
  /**
   * Deck language (frontmatter `lang`). It labels the container, so a screen
   * reader and a browser translator read the slides in it, it picks the chrome
   * texts, and French orthotypography applies only to French decks.
   */
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
  controls: true,
})

const emit = defineEmits<{
  /** Reveal is initialized; the host can bind keys or listen to slide changes. */
  ready: [reveal: RevealApi]
}>()

const themeName = computed(() => props.theme || getDefaultTheme())

const revealContainer = ref<HTMLElement | null>(null)

// The code theme sets CSS variables on the deck root, read by `code-theme.css`.
// A deck that declares none takes the one its theme names in its manifest.
const deckCodeStyle = computed(() => codeThemeStyle(props.code))
const codeStyle = computed(() => props.code == null
  ? codeThemeStyle(getThemeTokens(themeName.value)?.code)
  : deckCodeStyle.value)

// The block is painted only when the deck's own frontmatter names a background.
const codeClass = computed(() => ({
  'reveal--code-theme': Object.keys(codeStyle.value).length > 0,
  'reveal--code-block': '--code-background' in deckCodeStyle.value,
}))

const messages = computed(() => deckMessages(props.lang))
provide(DECK_MESSAGES_KEY, messages)

const frenchTypography = computed(() => !props.lang || props.lang.toLowerCase().startsWith('fr'))

// A `?print-pdf` load is detected at setup, before Reveal initializes, so the
// print config (full-page layout, one slide per page) applies from the start.
const requestUrl = useRequestURL()
const isPrintMode = new RegExp(PRINT_PDF_QUERY, 'i').test(requestUrl.search)

const effectiveConfig = isPrintMode
  ? buildPrintView({ meta: { reveal: props.config }, slides: [], assets: [] }, {
    deckUrl: requestUrl.href,
  }).reveal
  : (props.config || {})

// Reveal's print view is made for Chromium browsers (revealjs.com/pdf-export); in
// Firefox and Safari the print view names the browsers that export.
const printSupported = import.meta.client && isPrintMode && /Chrome\//.test(navigator.userAgent)

const preparingPrint = ref(printSupported)

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

const { themeReady } = useTheme(themeName)

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

// The print view renders its frames with Reveal's lazy `data-src`, and they load
// once the slides are in their pages: moving a slide reloads its frames. The
// dialog waits for each frame to load and, for a deck of this site, for Reveal to
// be ready in it, 60 seconds at most for a frame that does not load: a server
// renders the embedded decks one after the other, 2 to 5 seconds each.
// Reveal's paper stylesheet reflows a printed deck into plain text, except under
// `html.print-pdf`: an embedded deck takes the class, so it prints as on screen.
const FRAMES_MAX_MS = 60000

function frameSettled(frame: HTMLIFrameElement): Promise<void> {
  return new Promise((resolve) => {
    frame.addEventListener('load', () => {
      let doc: Document | null = null
      try {
        doc = frame.contentDocument
      }
      catch {}
      if (!doc?.querySelector('.reveal'))
        return resolve()
      const poll = () => {
        if (!doc!.querySelector('.reveal.ready'))
          return setTimeout(poll, 100)
        doc!.documentElement.classList.add('print-pdf')
        resolve()
      }
      poll()
    }, { once: true })
  })
}

// Reveal loads the frames of the current slide itself, from their `data-src`.
function loadFrame(frame: HTMLIFrameElement) {
  const src = frame.getAttribute('data-src')
  if (src && frame.getAttribute('src') !== src)
    frame.setAttribute('src', src)
  frame.removeAttribute('data-src')
}

function framesSettled(frames: HTMLIFrameElement[]): Promise<unknown> {
  return Promise.race([
    Promise.all(frames.map(frameSettled)),
    new Promise(resolve => setTimeout(resolve, FRAMES_MAX_MS)),
  ])
}

// A component drawn after its mount, such as a Mermaid diagram, carries
// `data-rendering` until it is drawn.
function drawingsSettled(root: HTMLElement): Promise<unknown> {
  const drawn = new Promise<void>((resolve) => {
    const pending = () => root.querySelector('[data-rendering]') !== null
    if (!pending())
      return resolve()
    const observer = new MutationObserver(() => {
      if (pending())
        return
      observer.disconnect()
      resolve()
    })
    observer.observe(root, { subtree: true, childList: true, attributeFilter: ['data-rendering'] })
  })
  return Promise.race([drawn, new Promise(resolve => setTimeout(resolve, FRAMES_MAX_MS))])
}

// Chrome prints a sheet of exactly the page size when its sides are a multiple
// of 8px, and rounds other sizes up, which leaves a white line along the page
// background. The pages grow to the next multiple of 8px, filled by their
// background.
function fitPagesToSheets(root: HTMLElement) {
  const pages = Array.from(root.querySelectorAll<HTMLElement>('.pdf-page'))
  if (!pages.length)
    return
  const eighth = (px: number) => Math.ceil(px / 8) * 8
  const width = eighth(document.body.offsetWidth)
  const height = eighth(pages[0]!.offsetHeight)
  const sheet = document.createElement('style')
  sheet.textContent = `@page { size: ${width}px ${height}px; margin: 0; }`
  document.head.appendChild(sheet)
  document.body.style.width = `${width}px`
  pages.forEach(page => page.style.height = `${height}px`)
}

// Reveal pages the deck once the document has loaded, which can come after
// Reveal's `ready`: the frames load and the dialog opens on `pdf-ready`, when the
// pages exist. A theme sizes a slide at 100% of its parent, and a print page is
// the slide plus its margin, so each slide gets its own height back first, and
// the frames load at their printed size. The dialog waits for the diagrams, and
// for the fonts, or the PDF takes the fallback font.
async function printWhenPaged() {
  const instance = getInstance()
  if (!instance || !revealContainer.value)
    return
  const { height } = instance.getComputedSlideSize()
  revealContainer.value
    .querySelectorAll<HTMLElement>('.pdf-page > section')
    .forEach(slide => slide.style.height = `${height}px`)
  fitPagesToSheets(revealContainer.value)
  const frames = Array.from(revealContainer.value.querySelectorAll('iframe'))
  const settled = framesSettled(frames)
  frames.forEach(loadFrame)
  await Promise.all([document.fonts.ready, settled, drawingsSettled(revealContainer.value)])
  if (!printSupported)
    return
  preparingPrint.value = false
  requestAnimationFrame(() => requestAnimationFrame(() => window.print()))
}

onMounted(async () => {
  mounted.value = true
  if (isPrintMode)
    revealContainer.value?.addEventListener('pdf-ready', printWhenPaged, { once: true })
  const liftTimer = setTimeout(() => ready.value = true, VEIL_MAX_MS)
  await Promise.all([initialize(), themeReady()])
  await document.fonts.ready
  clearTimeout(liftTimer)
  ready.value = true
  const instance = getInstance()
  if (instance)
    emit('ready', instance)
  revealContainer.value?.addEventListener('click', handleAnchorClick)
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
    :class="codeClass"
    :style="codeStyle"
    :data-reveal-config="resolvedRevealConfig"
    :lang="lang || undefined"
  >
    <!-- The veil precedes the slides so the browser paints it before them. -->
    <div
      class="deck-veil"
      :class="{ 'deck-veil--lifted': ready && !preparingPrint, 'deck-veil--print': mounted && preparingPrint }"
      role="status"
    >
      <span
        class="deck-veil__mark"
        aria-hidden="true"
      ><i /><i /><i /></span>
      <template v-if="mounted && preparingPrint">
        <p class="deck-veil__title">
          {{ messages.printPreparing }}
        </p>
        <p class="deck-veil__hint">
          {{ messages.printHint }}
        </p>
      </template>
      <span
        v-else
        class="deck-veil__label"
      >{{ messages.loading }}</span>
    </div>
    <div class="slides">
      <slot />
    </div>
    <!-- Screen-only, hidden by @media print: it offers to reopen the print dialog,
         or names the browsers that export, and leads back to the deck. -->
    <div
      v-if="mounted && isPrintMode && !preparingPrint"
      class="print-overlay"
    >
      <p>{{ printSupported ? messages.printReady : messages.printUnsupported }}</p>
      <p
        v-if="!printSupported"
        class="print-overlay__hint"
      >
        {{ messages.printUnsupportedHint }}
      </p>
      <button
        v-if="printSupported"
        type="button"
        class="print-overlay__btn"
        @click="reopenPrintDialog"
      >
        {{ messages.printReopen }}
      </button>
      <a
        class="print-overlay__btn"
        :class="{ 'print-overlay__btn--ghost': printSupported }"
        :href="exitPrintUrl"
      >
        {{ messages.printBack }}
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
  height: var(--vignettes-deck-height, 100vh);
}

.deck-veil {
  position: absolute;
  inset: 0;
  z-index: 60;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 2rem;
  text-align: center;
  background: var(--surface, #fff);
  transition: opacity 150ms ease, visibility 0s linear 150ms;
}

/* Paging makes the print view as tall as its pages, and Reveal hides the page
   while it pages. */
.deck-veil--print {
  position: fixed;
  visibility: visible;
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

.deck-veil__title,
.deck-veil__hint {
  max-width: 32rem;
  margin: 0;
  text-align: inherit;
  color: #1a1a1a;
}

.deck-veil__title {
  margin-top: 0.75rem;
  font-size: 1.25rem;
  font-weight: 600;
}

.deck-veil__hint {
  font-size: 0.95rem;
  color: #555;
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
  font-size: 1rem;
  text-align: center;
  color: #1a1a1a;
  background: #fff;
}

.print-overlay p {
  margin: 0;
  text-align: inherit;
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

<style>
/* A deck embedded in a page being printed shows its current slide only: under
   `print-pdf`, Reveal makes every background opaque, the hidden ones included. */
html.print-pdf:not(.reveal-print) .reveal .backgrounds > .slide-background:not(.present) {
  display: none !important;
}
</style>
