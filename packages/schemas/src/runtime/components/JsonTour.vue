<script setup lang="ts">
import type { JsonTourZoneRegistration } from '../injection-keys.ts'
import { nextTick, onBeforeUnmount, onMounted, provide, ref, useId } from 'vue'
import { JSON_TOUR } from '../injection-keys.ts'

// A file read alongside the description of what it holds. The `::Zone` children
// are Reveal fragments; the current one highlights its line range in the code
// block of the default slot and scrolls the panel to it.
interface Props {
  /** File name shown above the code panel. */
  file?: string
  /** Maximum height of the code panel, in slide pixels (the deck is 1280x720). */
  height?: string
  /** Width of the code panel, any CSS length. */
  panel?: string
  /** Scale of the zone cards. */
  size?: 'xs' | 'sm' | 'md'
  /** Shows the zones one at a time. */
  fragments?: boolean
  /** Puts the code panel under the zones, at full width, for a narrow column beside a media pane. */
  stack?: boolean
  /** Screenshot shown beside the tour; the current zone's `spot` is highlighted on it. */
  image?: string
  /** Text alternative of `image`. */
  alt?: string
  /** Words of the file to paint, separated by `|`; a word matches whole. */
  mark?: string
  /** Words of the file to underline, separated by `|`; a word matches whole. */
  underline?: string
}

const props = withDefaults(defineProps<Props>(), {
  height: '330px',
  panel: '47%',
  size: 'sm',
  fragments: true,
  stack: false,
})

defineSlots<{
  /** The `::Zone` blocks, then a fenced code block: the file shown in the panel. */
  default?: () => unknown
}>()

const root = ref<HTMLElement | null>(null)
const tourId = useId()
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

// The panel fades at an edge only where lines are cut off: at the top once it has
// scrolled down, at the bottom while the file goes on below.
function markOverflow() {
  if (!root.value || !pre)
    return
  const hidden = pre.scrollHeight - pre.clientHeight
  root.value.classList.toggle('json-tour--above', hidden > 1 && pre.scrollTop > 1)
  root.value.classList.toggle('json-tour--below', hidden > 1 && pre.scrollTop < hidden - 1)
}

// Highlights the lines of a range in a tour and brings them into its panel;
// `travel` moves the panel, animated on screen and at once on a printed page.
function showLines(tour: HTMLElement, range: [number, number] | null, travel: (panel: HTMLElement, target: number) => void) {
  const panel = tour.querySelector<HTMLElement>('pre')
  const rows = Array.from(tour.querySelectorAll<HTMLElement>('pre .line'))
  tour.classList.toggle('json-tour--focus', !!range)
  rows.forEach((line, i) => {
    const on = !!range && i + 1 >= range[0] && i + 1 <= range[1]
    line.classList.toggle('json-tour__line--on', on)
    // The words a zone points at carry their mark only while its lines are on.
    line.querySelectorAll<HTMLElement>('[data-json-tour-word]').forEach((word) => {
      if (word.dataset.jsonTourWord)
        word.classList.toggle(word.dataset.jsonTourWord, on)
    })
  })
  if (!range || !panel)
    return
  const first = rows[range[0] - 1]
  const last = rows[Math.min(range[1], rows.length) - 1]
  if (!first || !last)
    return
  // Rects come back scaled by Reveal's transform; divide by the panel's own
  // on-screen scale to get the distances the scroll position is expressed in.
  const box = panel.getBoundingClientRect()
  const k = box.height / panel.offsetHeight || 1
  const top = (first.getBoundingClientRect().top - box.top) / k
  const span = (last.getBoundingClientRect().bottom - first.getBoundingClientRect().top) / k
  travel(panel, Math.max(0, panel.scrollTop + top - (panel.clientHeight - span) / 2))
}

// Reveal marks the current fragment by class, so the panel follows the classes
// rather than Reveal's events: the same code then serves the editor preview,
// where fragments are off and every zone is shown at once.
function follow() {
  // Reveal keeps slides out of view at zero width; the measurements the scroll
  // needs only mean something once the slide has its size.
  if (!lines.length || !root.value?.offsetWidth)
    return
  markOverflow()
  const current = zones.find(z => z.el.classList.contains('current-fragment'))
    ?? (props.fragments ? undefined : zones[0])
  spot.value = parseSpot(current?.spot)
  showLines(root.value, current ? parseRange(current.lines) : null, (_, target) => scrollPanelTo(target))
}

// The print view pages the deck from copies of the slide, one per fragment step:
// each copy of the tour shows the lines of the zone current on its page.
function followPrintedPages() {
  document.querySelectorAll<HTMLElement>(`[data-json-tour="${tourId}"]`).forEach((tour) => {
    const current = Array.from(tour.querySelectorAll('.json-tour-zone'))
      .findIndex(zone => zone.classList.contains('current-fragment'))
    showLines(tour, parseRange(zones[current]?.lines), (panel, target) => panel.scrollTop = target)
  })
}

const DECK_EVENTS = ['ready', 'slidechanged', 'fragmentshown', 'fragmenthidden'] as const

let observer: MutationObserver | null = null
let resize: ResizeObserver | null = null
let deck: Element | null = null

/**
 * Wraps each occurrence of the given words in the code, inside the text nodes
 * Shiki produced, so a word of a key or of a value can carry its own mark. A
 * word matches whole: `rdgf:certification` stays out of `certificationLevel`.
 * A zone's words are searched in its lines only and wait, unmarked, for the
 * zone to be current.
 */
function decorate(words: string | undefined, className: string, within: Node | null = pre, zoneWord = false) {
  const needles = (words ?? '').split('|').map(w => w.trim()).filter(Boolean)
  if (!within || needles.length === 0)
    return
  const walker = document.createTreeWalker(within, NodeFilter.SHOW_TEXT)
  const texts: Text[] = []
  for (let node = walker.nextNode(); node; node = walker.nextNode())
    texts.push(node as Text)
  const edge = /[\w-]/
  for (const text of texts) {
    let node: Text | null = text
    while (node) {
      const value = node.nodeValue ?? ''
      let hit = -1
      let needle = ''
      for (const candidate of needles) {
        for (let at = value.indexOf(candidate); at >= 0; at = value.indexOf(candidate, at + 1)) {
          const after = value[at + candidate.length]
          const before = value[at - 1]
          if ((after && edge.test(after)) || (before && edge.test(before)))
            continue
          if (hit < 0 || at < hit) {
            hit = at
            needle = candidate
          }
          break
        }
      }
      if (hit < 0)
        break
      const rest = node.splitText(hit)
      const tail: Text | null = rest.length > needle.length ? rest.splitText(needle.length) : null
      const span = document.createElement('span')
      if (zoneWord)
        span.dataset.jsonTourWord = className
      else
        span.className = className
      rest.replaceWith(span)
      span.append(rest)
      node = tail
    }
  }
}

onMounted(async () => {
  await nextTick()
  pre = root.value?.querySelector('pre') ?? null
  decorate(props.mark, 'code-mark')
  decorate(props.underline, 'code-underline')
  lines = Array.from(root.value?.querySelectorAll<HTMLElement>('pre .line') ?? [])
  for (const zone of zones) {
    const range = parseRange(zone.lines)
    for (const line of range ? lines.slice(range[0] - 1, range[1]) : []) {
      decorate(zone.mark, 'code-mark', line, true)
      decorate(zone.underline, 'code-underline', line, true)
    }
  }
  pre?.addEventListener('scroll', markOverflow, { passive: true })
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
  deck?.addEventListener('pdf-ready', followPrintedPages)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(tween)
  pre?.removeEventListener('scroll', markOverflow)
  observer?.disconnect()
  resize?.disconnect()
  for (const event of DECK_EVENTS)
    deck?.removeEventListener(event, follow)
  deck?.removeEventListener('pdf-ready', followPrintedPages)
})
</script>

<template>
  <div
    ref="root"
    class="json-tour"
    :data-json-tour="tourId"
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
  min-height: calc(var(--json-tour-height) + 2.2em);
  margin: 0.4em 0;
  padding-right: calc(var(--json-tour-panel) + 1.8em);
}

/* The size scales the zones and the file name, and the code half as much, so a
   dense tour keeps a readable file. */
.json-tour--xs { --scheme-picto: 1.9em; --json-tour-scale: 0.66; }
.json-tour--sm { --scheme-picto: 2.2em; --json-tour-scale: 0.78; }
.json-tour--md { --scheme-picto: 2.8em; --json-tour-scale: 0.9; }

.json-tour :deep(.json-tour-zone) {
  font-size: calc(var(--json-tour-scale, 1) * 1em);
}

.json-tour__file {
  position: absolute;
  top: 0;
  right: 0;
  width: var(--json-tour-panel);
  margin: 0;
  font-family: var(--r-code-font, monospace);
  font-size: calc(var(--json-tour-scale, 1) * 0.72em);
  color: var(--text-mention);
  font-weight: 600;
}

.json-tour :deep(pre) {
  position: absolute;
  top: 2.2em;
  right: 0;
  width: var(--json-tour-panel);
  max-height: var(--json-tour-height);
  margin: 0;
  overflow: hidden;
  font-size: max(var(--code-size, 0px), calc(0.6em * (1 + var(--json-tour-scale, 1)) / 2));
  line-height: 1.55;
  scrollbar-width: none;
}

/* The panel shows a window on a longer file: a half-line at an edge where the
   file goes on fades out, so it reads as the file continuing. */
.json-tour--above :deep(pre) {
  mask-image: linear-gradient(to bottom, transparent, #000 1.6em);
}

.json-tour--below :deep(pre) {
  mask-image: linear-gradient(to bottom, #000 calc(100% - 1.6em), transparent);
}

.json-tour--above.json-tour--below :deep(pre) {
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
  border: 3px solid var(--accent);
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
  margin: 0;
}

.json-tour--stack :deep(pre) {
  position: relative;
  top: auto;
  right: auto;
  width: 100%;
  height: auto;
  max-height: var(--json-tour-height);
  margin-top: 1em;
}

.json-tour :deep(pre .line) {
  display: inline-block;
  width: 100%;
  padding: 0 0.5em;
  border-left: 2px solid transparent;
  transition: opacity 0.3s ease, background 0.3s ease;
}

/* The file reads whole until a zone is current, then the other lines dim. */
.json-tour--focus :deep(pre .line) {
  opacity: var(--code-dim, 0.4);
}

.json-tour :deep(pre .json-tour__line--on) {
  border-left-color: var(--code-active-bar, #8585f6);
  background: var(--code-active-background, rgb(255 255 255 / 8%));
  opacity: 1;
}
</style>
