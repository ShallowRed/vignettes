<script setup lang="ts">
import type { DiagramEdgeRegistration, DiagramNodeRegistration, DiagramSide } from '../injection-keys.ts'
import dagre from '@dagrejs/dagre'
import { computed, inject, nextTick, onBeforeUnmount, onMounted, provide, ref } from 'vue'
import { DIAGRAM } from '../injection-keys.ts'

// Pictogram cards (`::Node`) linked by drawn arrows (`::Edge`). `layout="grid"`
// places the cards where their `at` says; `layout="auto"` lets dagre place
// them by rank. Nodes and edges are Reveal fragments in writing order unless
// they carry a `step`.
interface Props {
  /** `grid` places each node at its `at` cell; `auto` ranks the nodes with dagre and ignores `at`. */
  layout?: 'grid' | 'auto'
  /** Number of grid columns. */
  cols?: string | number
  /** Column tracks as a CSS `grid-template-columns` value; overrides `cols`. */
  columns?: string
  /** Number of grid rows; the grid takes as many as its nodes need when absent. */
  rows?: string | number
  /** Rank direction for the automatic layout: left to right or top to bottom. */
  direction?: 'LR' | 'TB'
  /** Scale of the cards; `xs` leaves room for the arrows and their labels in a stack of cards. */
  size?: 'xs' | 'sm' | 'md' | 'lg'
  /** Shows the nodes and the edges one at a time, in writing order; each edge appears with the later of its nodes. */
  fragments?: boolean
  /** Dims the nodes already shown once a later one is current. */
  dim?: boolean
  /** Card width in px for the automatic layout (grid cells size their own). */
  nodeWidth?: string | number
  /** Height budget in px for the automatic layout; a taller graph is scaled down. */
  height?: string | number
  /** Grid gaps as `row column` CSS lengths. */
  gap?: string
  /** Default edge route: curved, or orthogonal elbows. */
  route?: 'curve' | 'orthogonal'
  /** Card surface: `outlined`, a white card with a border, or `plain`. */
  cards?: 'outlined' | 'plain'
  /** Card shape for every `::Node`: pictogram above the text, or beside it. */
  tiles?: 'column' | 'row'
}

const props = withDefaults(defineProps<Props>(), {
  layout: 'grid',
  cols: 3,
  direction: 'LR',
  size: 'md',
  fragments: true,
  dim: true,
  nodeWidth: 200,
  height: 460,
  gap: '1.2em 3em',
  route: 'curve',
  cards: 'outlined',
  tiles: 'column',
})

defineSlots<{
  /** The `::Node`, `::Edge` and `::Area` blocks. */
  default?: () => unknown
}>()

const root = ref<HTMLElement | null>(null)
const canvas = ref<HTMLElement | null>(null)
const svg = ref<SVGSVGElement | null>(null)
const svgLabels = ref<SVGSVGElement | null>(null)
const revealSync = inject<(() => void) | undefined>('revealSync', undefined)

const nodes: DiagramNodeRegistration[] = []
const edges: DiagramEdgeRegistration[] = []

provide(DIAGRAM, {
  fragments: props.fragments,
  tiles: props.tiles,
  registerNode: node => nodes.push(node),
  registerEdge: edge => edges.push(edge),
})

const columns = computed(() => Number(props.cols) || 3)
const rowCount = computed(() => Number(props.rows) || undefined)
const canvasStyle = ref<Record<string, string>>({})
const scale = ref(1)

interface Box { left: number, top: number, width: number, height: number }
const paths = ref<{ d: string, label?: string, lx: number, ly: number, labelAnchor: string, dashed?: boolean, arrow: boolean, index: number }[]>([])
const plates = ref<(Box | null)[]>([])

function stepIndex(node: DiagramNodeRegistration) {
  return node.step ?? nodes.indexOf(node)
}

function edgeIndex(edge: DiagramEdgeRegistration) {
  if (edge.step !== undefined)
    return edge.step
  const from = nodes.find(n => n.id === edge.from)
  const to = nodes.find(n => n.id === edge.to)
  return Math.max(from ? stepIndex(from) : 0, to ? stepIndex(to) : 0)
}

function box(el: HTMLElement): Box {
  // Rects are measured under Reveal's transform; divide by the on-screen scale
  // of the canvas to get canvas-space coordinates.
  const c = canvas.value!.getBoundingClientRect()
  const k = c.width / canvas.value!.offsetWidth || 1
  const r = el.getBoundingClientRect()
  return { left: (r.left - c.left) / k, top: (r.top - c.top) / k, width: r.width / k, height: r.height / k }
}

function layoutAuto() {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: props.direction, nodesep: 36, ranksep: 64, marginx: 4, marginy: 4 })
  g.setDefaultEdgeLabel(() => ({}))
  for (const n of nodes)
    g.setNode(n.id, { width: n.el.offsetWidth, height: n.el.offsetHeight })
  for (const e of edges)
    g.setEdge(e.from, e.to)
  dagre.layout(g)
  for (const n of nodes) {
    const p = g.node(n.id)
    n.el.style.left = `${p.x - p.width / 2}px`
    n.el.style.top = `${p.y - p.height / 2}px`
  }
  const { width = 0, height = 0 } = g.graph()
  const available = root.value!.offsetWidth
  const budget = Number(props.height) || height
  scale.value = Math.min(1, available / width, budget / height)
  const offset = Math.max(0, (available - width * scale.value) / 2)
  canvasStyle.value = { width: `${width}px`, height: `${height}px`, transform: `scale(${scale.value})`, marginLeft: `${offset}px` }
  root.value!.style.height = `${height * scale.value}px`
}

type Point = [number, number]

function anchor(b: Box, side: DiagramSide): Point {
  const cx = b.left + b.width / 2
  const cy = b.top + b.height / 2
  if (side === 'left')
    return [b.left, cy]
  if (side === 'right')
    return [b.left + b.width, cy]
  if (side === 'top')
    return [cx, b.top]
  return [cx, b.top + b.height]
}

function draw() {
  if (!canvas.value)
    return
  const cardOf = (n: DiagramNodeRegistration) => (n.el.querySelector('.picto-card') as HTMLElement) || n.el
  const boxes = new Map(nodes.map(n => [n.id, box(cardOf(n))]))
  paths.value = edges.flatMap((e) => {
    const a = boxes.get(e.from)
    const b = boxes.get(e.to)
    if (!a || !b)
      return []
    const dx = (b.left + b.width / 2) - (a.left + a.width / 2)
    const dy = (b.top + b.height / 2) - (a.top + a.height / 2)
    const horizontal = Math.abs(dx) >= Math.abs(dy)
    const fromSide: DiagramSide = e.anchors?.[0] ?? (horizontal ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'bottom' : 'top'))
    const toSide: DiagramSide = e.anchors?.[1] ?? (horizontal ? (dx >= 0 ? 'left' : 'right') : (dy >= 0 ? 'top' : 'bottom'))
    const s = anchor(a, fromSide)
    const t = anchor(b, toSide)
    const fromHorizontal = fromSide === 'left' || fromSide === 'right'
    const toHorizontal = toSide === 'left' || toSide === 'right'
    const route = e.route ?? props.route
    let d: string
    let mid: Point
    if (route === 'orthogonal') {
      if (fromHorizontal && toHorizontal) {
        const mx = (s[0] + t[0]) / 2
        d = `M ${s[0]} ${s[1]} H ${mx} V ${t[1]} H ${t[0]}`
        mid = [mx, (s[1] + t[1]) / 2]
      }
      else if (!fromHorizontal && !toHorizontal) {
        const my = (s[1] + t[1]) / 2
        d = `M ${s[0]} ${s[1]} V ${my} H ${t[0]} V ${t[1]}`
        mid = [(s[0] + t[0]) / 2, my]
      }
      else if (fromHorizontal) {
        d = `M ${s[0]} ${s[1]} H ${t[0]} V ${t[1]}`
        mid = [(s[0] + t[0]) / 2, s[1]]
      }
      else {
        d = `M ${s[0]} ${s[1]} V ${t[1]} H ${t[0]}`
        mid = [s[0], (s[1] + t[1]) / 2]
      }
    }
    else {
      // Control points leave and enter perpendicular to the sides.
      const reach = Math.max(40, Math.hypot(t[0] - s[0], t[1] - s[1]) / 2)
      const out = (side: DiagramSide): Point => side === 'right' ? [reach, 0] : side === 'left' ? [-reach, 0] : side === 'bottom' ? [0, reach] : [0, -reach]
      const o1 = out(fromSide)
      const o2 = out(toSide)
      const c1: Point = [s[0] + o1[0], s[1] + o1[1]]
      const c2: Point = [t[0] + o2[0], t[1] + o2[1]]
      d = `M ${s[0]} ${s[1]} C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${t[0]} ${t[1]}`
      // Bezier point at t = 0.5.
      mid = [
        (s[0] + 3 * c1[0] + 3 * c2[0] + t[0]) / 8,
        (s[1] + 3 * c1[1] + 3 * c2[1] + t[1]) / 8,
      ]
    }
    // The label sits beside the line: above a horizontal run, right of a vertical one.
    const labelAbove = fromHorizontal && toHorizontal
    return [{
      d,
      label: e.label,
      lx: labelAbove ? mid[0] : mid[0] + 14,
      ly: labelAbove ? mid[1] - 14 : mid[1],
      labelAnchor: labelAbove ? 'middle' : 'start',
      dashed: e.dashed,
      arrow: e.arrow !== false,
      index: edgeIndex(e),
    }]
  })
  if (canvas.value) {
    const viewBox = `0 0 ${canvas.value.offsetWidth} ${canvas.value.offsetHeight}`
    svg.value?.setAttribute('viewBox', viewBox)
    svgLabels.value?.setAttribute('viewBox', viewBox)
  }
}

// Reveal marks the fragments it knew when the slide was shown; an edge drawn
// later follows the state of its two cards.
function syncEdgeVisibility() {
  if (!props.fragments)
    return
  const lines = svg.value?.querySelectorAll<SVGGElement>('.diagram__edge') ?? []
  const labels = svgLabels.value?.querySelectorAll<SVGGElement>('.diagram__edge') ?? []
  edges.forEach((e, i) => {
    const from = nodes.find(n => n.id === e.from)?.el
    const to = nodes.find(n => n.id === e.to)?.el
    if (!from || !to)
      return
    const shown = from.classList.contains('visible') && to.classList.contains('visible')
    lines[i]?.classList.toggle('visible', shown)
    labels[i]?.classList.toggle('visible', shown)
  })
}

// A label can land over a card when the gap is narrower than the words; the
// plate measured here keeps it readable wherever it falls. `getBBox` throws on
// a slide Reveal is not showing, so the measurement waits for a laid-out slide.
function measurePlates() {
  if (!svgLabels.value || !root.value?.offsetWidth) {
    plates.value = []
    return
  }
  const labelled = paths.value.filter(p => p.label)
  const texts = svgLabels.value.querySelectorAll<SVGTextElement>('text')
  const boxes = new Map<number, Box>()
  labelled.forEach((p, i) => {
    const text = texts[i]
    if (!text)
      return
    try {
      const b = text.getBBox()
      if (b.width)
        boxes.set(paths.value.indexOf(p), { left: b.x - 5, top: b.y - 2, width: b.width + 10, height: b.height + 4 })
    }
    catch {
      // The slide has no layout yet; the next draw measures it.
    }
  })
  plates.value = paths.value.map((_, i) => boxes.get(i) ?? null)
}

let lastPaths = ''
function drawAndSync() {
  draw()
  const serialized = JSON.stringify(paths.value)
  if (serialized === lastPaths)
    return
  lastPaths = serialized
  nextTick(() => {
    measurePlates()
    syncEdgeVisibility()
    revealSync?.()
  })
}

let observer: ResizeObserver | null = null
let laidOutWidth = 0

// Reveal keeps slides out of view at zero width; the layout waits for the
// slide to get its size and runs again when that size changes.
function relayout() {
  const width = root.value?.offsetWidth ?? 0
  if (width === 0)
    return
  if (props.layout === 'auto' && width !== laidOutWidth)
    layoutAuto()
  laidOutWidth = width
  drawAndSync()
}

onMounted(async () => {
  await nextTick()
  for (const n of nodes) {
    if (props.fragments) {
      n.el.classList.add('fragment')
      n.el.dataset.fragmentIndex = String(stepIndex(n))
    }
  }
  relayout()
  observer = new ResizeObserver(() => relayout())
  if (root.value)
    observer.observe(root.value)
})

onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <div
    ref="root"
    class="diagram"
    :class="[`diagram--${layout}`, `diagram--${size}`, `diagram--cards-${cards}`, { 'diagram--dim': dim }]"
    :style="{ '--diagram-node-width': `${nodeWidth}px`, '--diagram-gap': gap }"
  >
    <div
      ref="canvas"
      class="diagram__canvas"
      :style="layout === 'grid'
        ? { gridTemplateColumns: props.columns ?? `repeat(${columns}, minmax(0, 1fr))`, gridTemplateRows: rowCount ? `repeat(${rowCount}, auto)` : undefined }
        : canvasStyle"
    >
      <svg
        ref="svg"
        class="diagram__edges"
        aria-hidden="true"
      >
        <defs>
          <marker
            id="diagram-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path
              d="M 0 0 L 10 5 L 0 10 z"
              fill="currentColor"
            />
          </marker>
        </defs>
        <g
          v-for="(p, i) in paths"
          :key="i"
          class="diagram__edge"
          :class="{ 'fragment': fragments, 'diagram__edge--dashed': p.dashed }"
          :data-fragment-index="fragments ? p.index : undefined"
        >
          <path
            :d="p.d"
            :marker-end="p.arrow ? 'url(#diagram-arrow)' : undefined"
          />
        </g>
      </svg>
      <slot />
      <!-- Cards carry a Reveal fragment, whose opacity puts them in the same
           paint layer as the arrows and above them in document order. The
           labels ride in a second layer after the cards so they stay legible
           when a gap is narrower than the words. -->
      <svg
        ref="svgLabels"
        class="diagram__edges diagram__edges--labels"
        aria-hidden="true"
      >
        <g
          v-for="(p, i) in paths"
          :key="i"
          class="diagram__edge"
          :class="{ fragment: fragments }"
          :data-fragment-index="fragments ? p.index : undefined"
        >
          <rect
            v-if="plates[i]"
            class="diagram__label-plate"
            :x="plates[i]!.left"
            :y="plates[i]!.top"
            :width="plates[i]!.width"
            :height="plates[i]!.height"
            rx="3"
          />
          <text
            v-if="p.label"
            :x="p.lx"
            :y="p.ly"
            :text-anchor="p.labelAnchor"
            dominant-baseline="middle"
          >{{ p.label }}</text>
        </g>
      </svg>
    </div>
  </div>
</template>

<style scoped>
.diagram {
  position: relative;
  width: 100%;
  margin: 0.5em 0;
}

.diagram--xs { --scheme-picto: 2.6em; --diagram-label: 1.05em; font-size: 0.66em; }
.diagram--sm { --scheme-picto: 3.2em; --diagram-label: 0.95em; font-size: 0.72em; }
.diagram--md { --scheme-picto: 4.5em; --diagram-label: 0.85em; font-size: 0.85em; }
.diagram--lg { --scheme-picto: 6em; --diagram-label: 0.8em; font-size: 0.95em; }

.diagram :deep(.picto-card) {
  padding: 0.8em 0.6em 0.7em;
  gap: 0.35em;
}

.diagram__canvas {
  position: relative;
  transform-origin: 0 0;
}

.diagram--grid .diagram__canvas {
  display: grid;
  gap: var(--diagram-gap, 1.2em 3em);
  align-items: center;
}

/* A region drawn as a header band reaches above its first row; the canvas
   keeps that band for it so the text above the diagram stays clear. */
.diagram--grid:has(.diagram-area--header) .diagram__canvas {
  padding-top: 2.4em;
}

/* Paint order, bottom up: the regions, the lines, the cards, the labels. */
.diagram__edges {
  position: absolute;
  z-index: 1;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
  color: var(--accent, #000091);
}

.diagram__edge path {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
}

.diagram__edge--dashed path {
  stroke-dasharray: 5 5;
}

/* Labels keep their own scale: the size classes shrink the cards, and a label
   that shrank with them stopped being readable on a projected slide. */
.diagram__edge text {
  font-size: var(--diagram-label, 0.8em);
  fill: var(--on-surface-default, #161616);
  font-family: inherit;
}

.diagram__edges--labels {
  z-index: 3;
}

.diagram__label-plate {
  fill: var(--surface, #fff);
  stroke: #ecebfd;
  stroke-width: 1;
}

.diagram :deep(.diagram-node) {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
}

.diagram--auto :deep(.diagram-node) {
  position: absolute;
  width: var(--diagram-node-width);
}

.diagram--auto :deep(.picto-card),
.diagram--grid :deep(.picto-card) {
  width: 100%;
}

/* A card that paints its own surface sets its text from the surface tokens. */
.diagram--cards-outlined :deep(.picto-card) {
  background: var(--surface, #fff);
  --text-title: var(--on-surface-title);
  --text-default: var(--on-surface-default);
  --text-mention: var(--on-surface-mention);
  border: 1px solid #cacafb;
}

.diagram--cards-outlined :deep(.picto-card--planned) {
  border: 2px dashed var(--accent, #000091);
}

.diagram--dim:has(.current-fragment) :deep(.fragment.visible:not(.current-fragment)) {
  opacity: 0.55;
  transition: opacity 0.3s ease;
}

/* The current card turns its own border to the accent and thickens it outward,
   so it keeps a single outline; a planned card keeps its dashes alone. */
.diagram :deep(.diagram-node.current-fragment .picto-card) {
  background: var(--accent-bg, #f5f5fe);
  --text-title: var(--on-surface-title);
  --text-default: var(--on-surface-default);
  --text-mention: var(--on-surface-mention);
  border-color: var(--accent, #000091);
  box-shadow: 0 0 0 1px var(--accent, #000091);
}

.diagram :deep(.diagram-node.current-fragment .picto-card--planned) {
  box-shadow: none;
}
</style>
