<script setup lang="ts">
import type { JsonTourZoneRegistration } from '../injection-keys'
import { nextTick, onBeforeUnmount, onMounted, provide, ref } from 'vue'
import { JSON_TOUR } from '../injection-keys'

// A file read alongside the description of what it holds. The `::Zone` children
// are Reveal fragments; the current one highlights its line range in the code
// block of the default slot and scrolls the panel to it.
interface Props {
  /** File name shown above the code panel. */
  file?: string
  /** Height of the code panel, in slide pixels (the deck is 1280x720). */
  height?: string
  /** Width of the code panel, any CSS length. */
  panel?: string
  size?: 'xs' | 'sm' | 'md'
  fragments?: boolean
  /** Put the code panel under the zones, full width, for a narrow column beside a media pane. */
  stack?: boolean
  /** Screenshot shown beside the tour; the current zone's `spot` is highlighted on it. */
  image?: string
  alt?: string
}

const props = withDefaults(defineProps<Props>(), {
  height: '330px',
  panel: '47%',
  size: 'sm',
  fragments: true,
  stack: false,
})

const root = ref<HTMLElement | null>(null)
const zones: JsonTourZoneRegistration[] = []
// `x,y,w,h` of the current zone on the image, in percent; null hides the spot.
const spot = ref<{ x: number, y: number, w: number, h: number } | null>(null)

function parseSpot(value: string | undefined) {
  const parts = (value ?? '').split(',').map(v => Number.parseFloat(v.trim()))
  if (parts.length !== 4 || parts.some(v => Number.isNaN(v)))
    return null
  const [x, y, w, h] = parts as [number, number, number, number]
  return { x, y, w, h }
}

provide(JSON_TOUR, {
  fragments: props.fragments,
  registerZone: zone => zones.push(zone),
})

let lines: HTMLElement[] = []
let pre: HTMLElement | null = null
let tween = 0

// `scrollTo({ behavior: 'smooth' })` is ignored on a panel that the user cannot
// scroll, so the travel is animated here.
function scrollPanelTo(target: number) {
  if (!pre)
    return
  const from = pre.scrollTop
  const distance = target - from
  if (Math.abs(distance) < 1)
    return
  const started = performance.now()
  cancelAnimationFrame(tween)
  const step = (now: number) => {
    const k = Math.min(1, (now - started) / 320)
    pre!.scrollTop = from + distance * (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2)
    if (k < 1)
      tween = requestAnimationFrame(step)
  }
  tween = requestAnimationFrame(step)
}

function parseRange(range: string | undefined): [number, number] | null {
  if (!range)
    return null
  const [from, to] = range.split('-').map(v => Number.parseInt(v.trim(), 10))
  if (!from)
    return null
  return [from, to || from]
}

// Reveal marks the current fragment by class, so the panel follows the classes
// rather than Reveal's events: the same code then serves the editor preview,
// where fragments are off and every zone is shown at once.
function follow() {
  // Reveal keeps slides out of view at zero width; the measurements the scroll
  // needs only mean something once the slide has its size.
  if (!lines.length || !root.value?.offsetWidth)
    return
  // The fade at the panel's edges only means something when there is more file
  // than the panel shows.
  root.value.classList.toggle('json-tour--scrolls', !!pre && pre.scrollHeight > pre.clientHeight + 1)
  const current = zones.find(z => z.el.classList.contains('current-fragment'))
    ?? (props.fragments ? undefined : zones[0])
  spot.value = parseSpot(current?.spot)
  const active = current ? parseRange(current.lines) : null
  lines.forEach((line, i) => {
    const on = !!active && i + 1 >= active[0] && i + 1 <= active[1]
    line.classList.toggle('json-tour__line--on', on)
  })
  if (!active || !pre)
    return
  const first = lines[active[0] - 1]
  const last = lines[Math.min(active[1], lines.length) - 1]
  if (!first || !last)
    return
  // Rects come back scaled by Reveal's transform; divide by the panel's own
  // on-screen scale to get the distances the scroll position is expressed in.
  const panel = pre.getBoundingClientRect()
  const k = panel.height / pre.offsetHeight || 1
  const top = (first.getBoundingClientRect().top - panel.top) / k
  const span = (last.getBoundingClientRect().bottom - first.getBoundingClientRect().top) / k
  scrollPanelTo(Math.max(0, pre.scrollTop + top - (pre.clientHeight - span) / 2))
}

const DECK_EVENTS = ['ready', 'slidechanged', 'fragmentshown', 'fragmenthidden'] as const

let observer: MutationObserver | null = null
let resize: ResizeObserver | null = null
let deck: Element | null = null

onMounted(async () => {
  await nextTick()
  pre = root.value?.querySelector('pre') ?? null
  lines = Array.from(root.value?.querySelectorAll<HTMLElement>('pre .line') ?? [])
  for (const [i, zone] of zones.entries()) {
    if (props.fragments) {
      zone.el.classList.add('fragment')
      zone.el.dataset.fragmentIndex = String(zone.step ?? i)
    }
  }
  follow()
  observer = new MutationObserver(() => follow())
  for (const zone of zones)
    observer.observe(zone.el, { attributes: true, attributeFilter: ['class'] })
  resize = new ResizeObserver(() => follow())
  if (root.value)
    resize.observe(root.value)
  // Opening the deck straight on a zone's fragment changes no class afterwards,
  // and Reveal lays the slide out well after this component mounts: the panel
  // takes its position on the deck's own events.
  deck = root.value?.closest('.reveal') ?? null
  for (const event of DECK_EVENTS)
    deck?.addEventListener(event, follow)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(tween)
  observer?.disconnect()
  resize?.disconnect()
  for (const event of DECK_EVENTS)
    deck?.removeEventListener(event, follow)
})
</script>

<template>
  <div
    ref="root"
    class="json-tour"
    :class="[`json-tour--${size}`, { 'json-tour--stack': stack, 'json-tour--shot': image }]"
    :style="{ '--json-tour-height': height, '--json-tour-panel': panel }"
  >
    <div class="json-tour__body">
      <p
        v-if="file"
        class="json-tour__file"
      >
        {{ file }}
      </p>
      <slot />
    </div>
    <figure
      v-if="image"
      class="json-tour__shot"
    >
      <img
        :src="image"
        :alt="alt ?? ''"
      >
      <div
        class="json-tour__spot"
        :class="{ 'json-tour__spot--on': spot }"
        :style="spot ? { left: `${spot.x}%`, top: `${spot.y}%`, width: `${spot.w}%`, height: `${spot.h}%` } : undefined"
      />
    </figure>
  </div>
</template>

<style scoped>
/* The panel is taken out of the flow and pinned to the right: the zones then
   stack at their own heights instead of being stretched by the panel's. */
.json-tour {
  position: relative;
  box-sizing: border-box;
  width: 100%;
  min-height: calc(var(--json-tour-height) + 1.6em);
  margin: 0.4em 0;
  padding-right: calc(var(--json-tour-panel) + 1.8em);
}

.json-tour--xs { --scheme-picto: 1.9em; font-size: 0.66em; }
.json-tour--sm { --scheme-picto: 2.2em; font-size: 0.78em; }
.json-tour--md { --scheme-picto: 2.8em; font-size: 0.9em; }

.json-tour__file {
  position: absolute;
  top: 0;
  right: 0;
  width: var(--json-tour-panel);
  margin: 0;
  font-family: var(--r-code-font, monospace);
  font-size: 0.72em;
  color: var(--text-mention, #666);
}

.json-tour :deep(pre) {
  position: absolute;
  top: 1.6em;
  right: 0;
  width: var(--json-tour-panel);
  height: var(--json-tour-height);
  margin: 0;
  overflow: hidden;
  font-size: 0.6em;
  line-height: 1.55;
  scrollbar-width: none;
}

/* The panel shows a window on a longer file: the first and last lines fade
   out so a half-line at the edge reads as the file continuing. */
.json-tour--scrolls :deep(pre) {
  mask-image: linear-gradient(to bottom, transparent, #000 1.6em, #000 calc(100% - 1.6em), transparent);
}

.json-tour :deep(pre)::-webkit-scrollbar {
  display: none;
}

/* With an image: the zones and the panel on the left, the screenshot on the
   right, and a frame that travels to the current zone's spot while the rest of
   the screen dims. */
.json-tour--shot {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.45fr);
  gap: 0 1.6em;
  align-items: start;
  padding-right: 0;
}

.json-tour__shot {
  position: relative;
  margin: 0;
  overflow: hidden;
  border-radius: 6px;
  box-shadow: 0 6px 24px rgb(0 0 145 / 12%);
}

.json-tour__shot img {
  display: block;
  width: 100%;
  height: auto;
}

.json-tour__spot {
  position: absolute;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
  border: 3px solid var(--accent, #000091);
  border-radius: 6px;
  box-shadow: 0 0 0 9999px rgb(255 255 255 / 55%);
  opacity: 0;
  transition: top 0.45s ease, left 0.45s ease, width 0.45s ease, height 0.45s ease, opacity 0.3s ease;
  pointer-events: none;
}

.json-tour__spot--on {
  opacity: 1;
}

/* Stacked: the zones sit above the panel, which takes the whole column. */
.json-tour--stack {
  min-height: 0;
  padding-right: 0;
}

.json-tour--stack .json-tour__file {
  position: static;
  width: auto;
  margin: 0 0 0.3em;
}

.json-tour--stack :deep(pre) {
  position: relative;
  top: auto;
  right: auto;
  width: 100%;
  height: auto;
  max-height: var(--json-tour-height);
  margin-top: 0.5em;
}

.json-tour :deep(pre .line) {
  display: inline-block;
  width: 100%;
  padding: 0 0.5em;
  border-left: 2px solid transparent;
  opacity: 0.4;
  transition: opacity 0.3s ease, background 0.3s ease;
}

.json-tour :deep(pre .json-tour__line--on) {
  border-left-color: #8585f6;
  background: rgb(255 255 255 / 8%);
  opacity: 1;
}
</style>
