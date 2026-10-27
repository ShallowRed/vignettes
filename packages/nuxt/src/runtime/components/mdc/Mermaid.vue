<script setup lang="ts">
import type { MermaidConfig } from 'mermaid'
import { inject, nextTick, onBeforeUnmount, onMounted, ref, useId } from 'vue'
import { useDeckMessages } from '../../composables/useDeckMessages.ts'
import { sharedFitScale } from '../../utils/diagram-fit.ts'

const props = defineProps<{
  /**
   * A Mermaid theme; without it, the diagram takes the colors and the font of the deck theme.
   * @fr Thème Mermaid ; sans lui, le diagramme prend les couleurs et la police du thème de la présentation.
   */
  theme?: 'default' | 'dark' | 'forest' | 'neutral'
  /**
   * Reveal steps as node-id groups: `A,B|C|D` shows A and B, then C, then D; edges follow their later node.
   * @fr Étapes d'apparition, en groupes d'identifiants de nœuds : `A,B|C|D` montre A et B, puis C, puis D ; un lien apparaît avec le dernier de ses deux nœuds.
   */
  steps?: string
}>()

defineSlots<{
  /** A fenced code block in `mermaid`. */
  default?: () => unknown
}>()

const messages = useDeckMessages()

const revealSync = inject<(() => void) | undefined>('revealSync', undefined)

// Flowchart node ids look like `flowchart-A-12`, edge paths like `L_A_B_0`; node ids
// in the source must stay free of `-` and `_` for the edge match.
function applySteps(svgRoot: SVGElement, steps: string) {
  const groups = steps.split('|').map(g => g.split(',').map(id => id.trim()).filter(Boolean))
  const stepOf = new Map<string, number>()
  groups.forEach((ids, i) => ids.forEach(id => stepOf.set(id, i)))
  const mark = (el: Element, index: number) => {
    el.classList.add('fragment')
    el.setAttribute('data-fragment-index', String(index))
  }
  svgRoot.querySelectorAll('g.node').forEach((g) => {
    const m = g.id.match(/^(?:flowchart|graph)-(.+)-\d+$/)
    const step = m ? stepOf.get(m[1]!) : undefined
    if (step !== undefined)
      mark(g, step)
  })
  const edgeStep = (id: string) => {
    const m = id.match(/^L[-_]([^-_]+)[-_]([^-_]+)[-_]\d+$/)
    if (!m)
      return undefined
    const a = stepOf.get(m[1]!)
    const b = stepOf.get(m[2]!)
    return a === undefined || b === undefined ? undefined : Math.max(a, b)
  }
  svgRoot.querySelectorAll('path.flowchart-link, g.edgeLabel').forEach((el) => {
    const id = el.id || el.getAttribute('data-id') || ''
    const step = edgeStep(id.replace(/^L-L/, 'L'))
    if (step !== undefined)
      mark(el, step)
  })
}

// A `%%{init}%%` block in the diagram overrides these.
const SLIDE_SEQUENCE = {
  mirrorActors: false,
  actorMargin: 30,
  messageMargin: 14,
  boxMargin: 4,
  noteMargin: 6,
  diagramMarginY: 4,
  wrap: true,
  width: 180,
}

// Lengths in the slide's own unit, before Reveal scales the slide to the screen.
// The body ends at the bottom of the slide, less the bottom paddings: in the
// scroll view the article takes the height of its content.
function fitSlideDiagrams(slide: HTMLElement) {
  if (!slide.offsetHeight)
    return
  const ratio = slide.getBoundingClientRect().height / slide.offsetHeight
  const body = slide.querySelector<HTMLElement>('article') ?? slide
  const padding = getComputedStyle(body)
  const top = body.getBoundingClientRect().top / ratio + Number.parseFloat(padding.paddingTop)
  const slideStyle = getComputedStyle(slide)
  const bottom = slide.getBoundingClientRect().bottom / ratio - Number.parseFloat(slideStyle.paddingBottom)
    - (body === slide ? 0 : Number.parseFloat(padding.paddingBottom))
  const room = bottom - top
  const used = usedHeight(laidOutChildren(body)) / ratio
  const drawn = [...slide.querySelectorAll<HTMLElement>('.mermaid-container')]
    .flatMap(box => [...box.querySelectorAll<SVGSVGElement>(':scope > svg')].map(svg => ({ box, svg })))
  const rooms = drawn.map(({ box, svg }) => {
    const { width, height } = svg.viewBox.baseVal
    return {
      width,
      height,
      availableWidth: box.clientWidth,
      availableHeight: svg.getBoundingClientRect().height / ratio + room - used,
    }
  })
  const scale = sharedFitScale(rooms)
  for (const { svg } of drawn) {
    svg.style.maxWidth = '100%'
    svg.style.width = `${svg.viewBox.baseVal.width * scale}px`
  }
}

// The boxes a parent lays out: MDC wraps slots in `display: contents` elements.
function laidOutChildren(parent: Element): Element[] {
  return [...parent.children].flatMap(el => getComputedStyle(el).display === 'contents' ? laidOutChildren(el) : [el])
}

// From the top margin of the highest block to the bottom margin of the lowest.
function usedHeight(blocks: Element[]): number {
  let top = Infinity
  let bottom = -Infinity
  for (const el of blocks) {
    const rect = el.getBoundingClientRect()
    if (!rect.height)
      continue
    const style = getComputedStyle(el)
    top = Math.min(top, rect.top - Number.parseFloat(style.marginTop))
    bottom = Math.max(bottom, rect.bottom + Number.parseFloat(style.marginBottom))
  }
  return bottom > top ? bottom - top : 0
}

let resizeObserver: ResizeObserver | undefined
let mutationObserver: MutationObserver | undefined

// Fits again when the slide is shown or resized, when a block changes size (an
// image loads), and when the editor preview changes the content.
function watchSlide(slide: HTMLElement) {
  const body = slide.querySelector<HTMLElement>('article') ?? slide
  const fit = () => {
    fitSlideDiagrams(slide)
    for (const el of [slide, body, ...laidOutChildren(body)])
      resizeObserver?.observe(el)
  }
  resizeObserver = new ResizeObserver(fit)
  mutationObserver = new MutationObserver(fit)
  mutationObserver.observe(body, { childList: true, subtree: true, characterData: true })
  fit()
}

const container = ref<HTMLElement | null>(null)
const hiddenSlot = ref<HTMLElement | null>(null)
const fullscreenOverlay = ref<HTMLElement | null>(null)
const fullscreenContent = ref<HTMLElement | null>(null)
const diagramId = `mermaid-${useId()}`

const isFullscreen = ref(false)

const scale = ref(1)
const panX = ref(0)
const panY = ref(0)
const isDragging = ref(false)
const dragStart = { x: 0, y: 0 }
const MIN_SCALE = 0.25
const MAX_SCALE = 5

// The overlay content exists once `isFullscreen` renders it.
async function openFullscreen() {
  const svg = container.value?.querySelector('svg')
  if (!svg)
    return
  isFullscreen.value = true
  await nextTick()
  if (!fullscreenContent.value)
    return

  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.style.maxWidth = 'none'
  clone.style.width = `${svg.viewBox.baseVal.width}px`
  clone.style.height = ''
  fullscreenContent.value.replaceChildren(clone)

  scale.value = 1
  panX.value = 0
  panY.value = 0
  resetTransform()
}

function closeFullscreen() {
  isFullscreen.value = false
  isDragging.value = false
}

function updateTransform() {
  if (!fullscreenContent.value)
    return
  fullscreenContent.value.style.transform = `translate(${panX.value}px, ${panY.value}px) scale(${scale.value})`
}

function resetTransform() {
  if (!fullscreenContent.value)
    return
  const svg = fullscreenContent.value.querySelector('svg')
  if (!svg)
    return

  const space = fullscreenContent.value.parentElement
  if (!space)
    return

  const spaceRect = space.getBoundingClientRect()
  // The layout size, measured before the transform scales it.
  const svgStyle = getComputedStyle(svg)
  const svgWidth = Number.parseFloat(svgStyle.width)
  const svgHeight = Number.parseFloat(svgStyle.height)

  const fitScale = Math.min(
    (spaceRect.width * 0.9) / svgWidth,
    (spaceRect.height * 0.9) / svgHeight,
    1.5,
  )

  scale.value = fitScale
  panX.value = (spaceRect.width - svgWidth * fitScale) / 2
  panY.value = (spaceRect.height - svgHeight * fitScale) / 2
  updateTransform()
}

function zoomBy(delta: number) {
  const newScale = Math.min(Math.max(scale.value + delta, MIN_SCALE), MAX_SCALE)
  // Zoom around the center of the space.
  if (fullscreenContent.value?.parentElement) {
    const rect = fullscreenContent.value.parentElement.getBoundingClientRect()
    const centerX = rect.width / 2
    const centerY = rect.height / 2

    const scaleDiff = newScale - scale.value
    panX.value -= centerX * scaleDiff
    panY.value -= centerY * scaleDiff
  }

  scale.value = newScale
  updateTransform()
}

function onMouseDown(e: MouseEvent) {
  if (e.button !== 0)
    return
  isDragging.value = true
  dragStart.x = e.clientX - panX.value
  dragStart.y = e.clientY - panY.value
}

function onMouseMove(e: MouseEvent) {
  if (!isDragging.value)
    return
  e.preventDefault()
  panX.value = e.clientX - dragStart.x
  panY.value = e.clientY - dragStart.y
  updateTransform()
}

function onMouseUp() {
  isDragging.value = false
}

function onTouchStart(e: TouchEvent) {
  if (e.touches.length !== 1)
    return
  isDragging.value = true
  const touch = e.touches[0]!
  dragStart.x = touch.clientX - panX.value
  dragStart.y = touch.clientY - panY.value
}

function onTouchMove(e: TouchEvent) {
  if (!isDragging.value || e.touches.length !== 1)
    return
  e.preventDefault()
  const touch = e.touches[0]!
  panX.value = touch.clientX - dragStart.x
  panY.value = touch.clientY - dragStart.y
  updateTransform()
}

function onTouchEnd() {
  isDragging.value = false
}

function onWheel(e: WheelEvent) {
  e.preventDefault()
  const delta = e.deltaY > 0 ? -0.1 : 0.1
  zoomBy(delta)
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && isFullscreen.value) {
    closeFullscreen()
  }
}

function onOverlayClick(e: MouseEvent) {
  if (e.target === fullscreenOverlay.value) {
    closeFullscreen()
  }
}

// The print view waits for every `data-rendering` element to lose the attribute.
const rendering = ref(true)

onMounted(async () => {
  document.addEventListener('keydown', onKeyDown)
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
  document.addEventListener('touchmove', onTouchMove, { passive: false })
  document.addEventListener('touchend', onTouchEnd)

  try {
    await draw()
  }
  finally {
    rendering.value = false
  }
})

async function draw() {
  await nextTick()

  if (!container.value || !hiddenSlot.value)
    return

  const codeElement = hiddenSlot.value.querySelector('pre code') || hiddenSlot.value.querySelector('code')
  let code = ''

  if (codeElement) {
    code = codeElement.textContent?.trim() || ''
  }
  else {
    const preElement = hiddenSlot.value.querySelector('pre')
    if (preElement) {
      code = preElement.textContent?.trim() || ''
    }
    else {
      code = hiddenSlot.value.textContent?.trim() || ''
    }
  }

  if (!code) {
    console.error('Mermaid: No code found in slot')
    return
  }

  // Dynamic import to avoid SSR issues.
  const mermaid = (await import('mermaid')).default

  // Mermaid sizes each box from the width of its label: it measures with the
  // slide's own font, once loaded, or the labels overflow their boxes.
  await document.fonts.ready
  const style = getComputedStyle(container.value)
  // Lines and free text sit on the slide, whose text colors the parent carries;
  // the container gives the labels, which sit on fills, the surface text colors.
  const slide = getComputedStyle(container.value.parentElement ?? container.value)
  const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
  const slideToken = (name: string, fallback: string) => slide.getPropertyValue(name).trim() || fallback
  const font = { fontFamily: style.fontFamily, fontSize: style.fontSize }

  const config: MermaidConfig = {
    startOnLoad: false,
    // Without a named theme, the diagram takes the colors of the deck's theme.
    theme: props.theme || 'base',
    themeVariables: props.theme
      ? font
      : {
          ...font,
          primaryColor: token('--accent-bg', '#f4f6fd'),
          primaryBorderColor: token('--accent', '#1c4fd8'),
          primaryTextColor: token('--text-title', '#111111'),
          secondaryColor: token('--surface', '#ffffff'),
          tertiaryColor: token('--surface', '#ffffff'),
          lineColor: slideToken('--text-mention', '#6b6b6b'),
          textColor: slideToken('--text-default', '#1a1a1a'),
          edgeLabelBackground: token('--surface', '#ffffff'),
        },
    fontFamily: style.fontFamily,
    sequence: SLIDE_SEQUENCE,
    // Deck source is author-editable and rendered for every viewer, so keep
    // Mermaid's DOMPurify pass on: strict encodes HTML in labels and disables
    // click directives.
    securityLevel: 'strict',
  }

  try {
    const { svg } = await inTurn(() => {
      mermaid.initialize(config)
      return mermaid.render(diagramId, code)
    })
    container.value.innerHTML = svg
    const section = container.value.closest('section')
    if (section)
      watchSlide(section)
    if (props.steps) {
      const svgRoot = container.value.querySelector('svg')
      if (svgRoot)
        applySteps(svgRoot, props.steps)
      await nextTick()
      revealSync?.()
    }
  }
  catch (error) {
    console.error('Mermaid rendering error:', error)
    // textContent, not innerHTML: the raw source is untrusted and this path
    // runs precisely when it failed to parse as a diagram.
    const pre = document.createElement('pre')
    pre.className = 'mermaid-error'
    pre.textContent = code
    container.value.replaceChildren(pre)
  }
}

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  mutationObserver?.disconnect()
  document.removeEventListener('keydown', onKeyDown)
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
  document.removeEventListener('touchmove', onTouchMove)
  document.removeEventListener('touchend', onTouchEnd)
})
</script>

<script lang="ts">
// Mermaid keeps one configuration for the page: each diagram sets it with the
// font of its slide, then renders, before the next diagram sets it.
let renderQueue: Promise<unknown> = Promise.resolve()

function inTurn<T>(task: () => Promise<T>): Promise<T> {
  const run = renderQueue.then(task)
  renderQueue = run.catch(() => {})
  return run
}
</script>

<template>
  <div
    class="mermaid-wrapper"
    :data-rendering="rendering || undefined"
  >
    <div
      ref="hiddenSlot"
      style="display: none;"
    >
      <slot />
    </div>

    <div class="mermaid-diagram">
      <div
        ref="container"
        class="mermaid-container"
      />
      <button
        class="expand-button"
        :aria-label="messages.enlargeDiagram"
        :title="messages.fullscreen"
        @click="openFullscreen"
        @keydown.space.stop
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="15 3 21 3 21 9" />
          <polyline points="9 21 3 21 3 15" />
          <line
            x1="21"
            y1="3"
            x2="14"
            y2="10"
          />
          <line
            x1="3"
            y1="21"
            x2="10"
            y2="14"
          />
        </svg>
      </button>
    </div>

    <Teleport to="body">
      <div
        v-if="isFullscreen"
        ref="fullscreenOverlay"
        class="mermaid-fullscreen-overlay"
        @click="onOverlayClick"
      >
        <div
          class="mermaid-fullscreen-space"
          :style="{ cursor: isDragging ? 'grabbing' : 'grab' }"
          @mousedown="onMouseDown"
          @touchstart.passive="onTouchStart"
          @wheel.prevent="onWheel"
        >
          <div
            ref="fullscreenContent"
            class="mermaid-fullscreen-content"
          />
        </div>

        <div
          class="mermaid-controls"
          @mousedown.stop
          @click.stop
        >
          <button
            class="mermaid-control-btn"
            :title="messages.zoomOut"
            @click="zoomBy(-0.15)"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            ><line
              x1="5"
              y1="12"
              x2="19"
              y2="12"
            /></svg>
          </button>
          <button
            class="mermaid-control-btn"
            :title="messages.zoomReset"
            @click="resetTransform"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
          <button
            class="mermaid-control-btn"
            :title="messages.zoomIn"
            @click="zoomBy(0.15)"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            ><line
              x1="12"
              y1="5"
              x2="12"
              y2="19"
            /><line
              x1="5"
              y1="12"
              x2="19"
              y2="12"
            /></svg>
          </button>
          <button
            class="mermaid-control-btn"
            :title="messages.close"
            @click="closeFullscreen"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            ><line
              x1="18"
              y1="6"
              x2="6"
              y2="18"
            /><line
              x1="6"
              y1="6"
              x2="18"
              y2="18"
            /></svg>
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.mermaid-diagram {
  position: relative;
}

.mermaid-container {
  --text-title: var(--on-surface-title);
  --text-default: var(--on-surface-default);
  --text-mention: var(--on-surface-mention);

  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  overflow: auto;
}

.mermaid-container :deep(svg) {
  max-width: 100%;
  height: auto;
}

.expand-button {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid rgba(128, 128, 128, 0.3);
  background: rgba(255, 255, 255, 0.85);
  color: #555;
  border-radius: 6px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s, background 0.2s, color 0.2s;
  z-index: 2;
  backdrop-filter: blur(4px);
}

.mermaid-diagram:hover .expand-button,
.expand-button:focus-visible {
  opacity: 1;
}

/* On a touch screen the button stays shown, 44 pixels wide at any slide scale. */
@media (hover: none) {
  .expand-button {
    opacity: 1;
    zoom: calc(1.375 / var(--slide-scale, 1));
  }
}

.expand-button:hover {
  background: rgba(255, 255, 255, 1);
  color: #000;
  border-color: rgba(128, 128, 128, 0.6);
}

.mermaid-fullscreen-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
}

.mermaid-fullscreen-space {
  position: relative;
  width: 85vw;
  height: 85vh;
  background: white;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.mermaid-fullscreen-content {
  transform-origin: 0 0;
  transition: transform 0.08s ease-out;
  position: absolute;
  top: 0;
  left: 0;
}

.mermaid-fullscreen-content :deep(svg) {
  max-width: none;
  height: auto;
}

.mermaid-controls {
  position: fixed;
  bottom: calc((100vh - 85vh) / 2 + 16px);
  right: calc((100vw - 85vw) / 2 + 16px);
  display: flex;
  gap: 6px;
  padding: 6px;
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  z-index: 10000;
  backdrop-filter: blur(8px);
}

.mermaid-control-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid rgba(0, 0, 0, 0.1);
  background: white;
  color: #333;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.mermaid-control-btn:hover {
  background: #f0f0f0;
  border-color: rgba(0, 0, 0, 0.2);
  color: #000;
}

.mermaid-control-btn:active {
  background: #e0e0e0;
}

.mermaid-error {
  background: #fee;
  color: #c00;
  padding: 1rem;
  border-radius: 4px;
  font-size: 0.875rem;
  white-space: pre-wrap;
}
</style>
