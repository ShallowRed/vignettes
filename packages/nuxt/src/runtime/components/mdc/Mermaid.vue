<script setup lang="ts">
import { inject, nextTick, onBeforeUnmount, onMounted, ref, useId } from 'vue'
import { useDeckMessages } from '../../composables/useDeckMessages.ts'

const props = defineProps<{
  theme?: 'default' | 'dark' | 'forest' | 'neutral'
  /** Reveal steps as node-id groups: `A,B|C|D` shows A and B, then C, then D; edges follow their later node. */
  steps?: string
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
    const step = m ? stepOf.get(m[1]) : undefined
    if (step !== undefined)
      mark(g, step)
  })
  const edgeStep = (id: string) => {
    const m = id.match(/^L[-_]([^-_]+)[-_]([^-_]+)[-_]\d+$/)
    if (!m)
      return undefined
    const a = stepOf.get(m[1])
    const b = stepOf.get(m[2])
    return a === undefined || b === undefined ? undefined : Math.max(a, b)
  }
  svgRoot.querySelectorAll('path.flowchart-link, g.edgeLabel').forEach((el) => {
    const id = el.id || el.getAttribute('data-id') || ''
    const step = edgeStep(id.replace(/^L-L/, 'L'))
    if (step !== undefined)
      mark(el, step)
  })
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

function openFullscreen() {
  if (!container.value)
    return
  const svg = container.value.querySelector('svg')
  if (!svg || !fullscreenContent.value)
    return

  const clone = svg.cloneNode(true) as SVGElement
  clone.style.maxWidth = 'none'
  clone.style.width = ''
  clone.style.height = ''
  fullscreenContent.value.innerHTML = ''
  fullscreenContent.value.appendChild(clone)

  scale.value = 1
  panX.value = 0
  panY.value = 0
  updateTransform()

  isFullscreen.value = true

  nextTick(() => {
    resetTransform()
  })
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
  const svgRect = svg.getBoundingClientRect()
  const svgWidth = svgRect.width / scale.value
  const svgHeight = svgRect.height / scale.value

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
  const touch = e.touches[0]
  dragStart.x = touch.clientX - panX.value
  dragStart.y = touch.clientY - panY.value
}

function onTouchMove(e: TouchEvent) {
  if (!isDragging.value || e.touches.length !== 1)
    return
  e.preventDefault()
  const touch = e.touches[0]
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

onMounted(async () => {
  document.addEventListener('keydown', onKeyDown)
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
  document.addEventListener('touchmove', onTouchMove, { passive: false })
  document.addEventListener('touchend', onTouchEnd)

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

  mermaid.initialize({
    startOnLoad: false,
    theme: props.theme || 'default',
    // Deck source is author-editable and rendered for every viewer, so keep
    // Mermaid's DOMPurify pass on: strict encodes HTML in labels and disables
    // click directives.
    securityLevel: 'strict',
    fontFamily: 'inherit',
  })

  try {
    const { svg } = await mermaid.render(diagramId, code)
    container.value.innerHTML = svg
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
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeyDown)
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
  document.removeEventListener('touchmove', onTouchMove)
  document.removeEventListener('touchend', onTouchEnd)
})
</script>

<template>
  <div class="mermaid-wrapper">
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

.mermaid-diagram:hover .expand-button {
  opacity: 1;
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
