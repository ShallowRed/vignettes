<script setup lang="ts">
import type { JsonTourZoneRegistration } from '~/config/injection-keys'
import { nextTick, onBeforeUnmount, onMounted, provide, ref } from 'vue'
import { JSON_TOUR } from '~/config/injection-keys'

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
}

const props = withDefaults(defineProps<Props>(), {
  height: '330px',
  panel: '47%',
  size: 'sm',
  fragments: true,
})

const root = ref<HTMLElement | null>(null)
const zones: JsonTourZoneRegistration[] = []

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
  const current = zones.find(z => z.el.classList.contains('current-fragment'))
    ?? (props.fragments ? undefined : zones[0])
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
    :class="`json-tour--${size}`"
    :style="{ '--json-tour-height': height, '--json-tour-panel': panel }"
  >
    <p
      v-if="file"
      class="json-tour__file"
    >
      {{ file }}
    </p>
    <slot />
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
  /* The panel shows a window on a longer file: the first and last lines fade
     out so a half-line at the edge reads as the file continuing. */
  mask-image: linear-gradient(to bottom, transparent, #000 1.6em, #000 calc(100% - 1.6em), transparent);
}

.json-tour :deep(pre)::-webkit-scrollbar {
  display: none;
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
