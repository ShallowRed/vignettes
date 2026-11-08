import type { MDCRoot } from '@nuxtjs/mdc'
import type { SlideRange } from '@vignettes/core/deck'
import type { PresentationData, Slide } from '../types/presentation.ts'
import { deckComponentNamed, deckComponents } from '@vignettes/core/deck'
import { knownComponentNames, unknownComponents } from './slide-rendering.ts'

/**
 * Editor-only mapping between the source and what the preview shows. The slide
 * boundaries come from `slideRanges` of `@vignettes/core`, the definition the
 * renderers share; this module finds the slide and the fragment under a line,
 * the place of a slide the preview draws, and the component names the slides
 * draw as plain content.
 */

/**
 * The component names of a deck that no registered component answers to: the
 * slides draw their content without the component.
 */
export function unknownDeckComponents(data: PresentationData): string[] {
  const known = knownComponentNames()
  const slides = data.slides.flatMap(slide => [slide, ...(slide.verticalSlides ?? [])])
  const trees = slides.flatMap(slide => [slide.header, slide.pretitle, slide.subtitle, slide.body])
  return [...new Set(trees.flatMap(tree => (tree ? unknownComponents(tree as MDCRoot, known) : [])))]
}

/** Reveal indices for the slide containing `line` (1-based), clamped to range. */
export function slideAtLine(ranges: SlideRange[], line: number): { h: number, v: number } {
  let found = ranges[0] ?? { h: 0, v: 0 }
  for (const r of ranges) {
    if (r.startLine <= line)
      found = r
    else
      break
  }
  return { h: found.h, v: found.v }
}

/** Reveal indices of a slide of `slides`, found by identity, or undefined for a slide outside them. */
export function slidePlace(slides: readonly Slide[], slide: Slide): { h: number, v: number } | undefined {
  for (const [h, section] of slides.entries()) {
    const v = section.verticalSlides?.length ? section.verticalSlides.indexOf(slide) : section === slide ? 0 : -1
    if (v >= 0)
      return { h, v }
  }
  return undefined
}

// ── Fragments ────────────────────────────────────────────────────────────────

/**
 * Line-to-fragment mapping, a heuristic reading of the source: the fragment
 * index Reveal gives the component under the cursor, so the preview can
 * open the slide at that step. Counted from the source in writing order, or by
 * their `step`: the children the contract declares as fragments of their parent
 * (`DeckComponent.fragment`), and each item or paragraph of a `::Fragments`
 * block. A container with `:fragments="false"` counts nothing.
 */

const BLOCK_OPEN_RE = /^\s*(:{2,})([A-Z][\w-]*)(\{[^}]*\})?/i
const BLOCK_CLOSE_RE = /^\s*(:{2,})\s*$/
const LIST_ITEM_RE = /^\s*(?:[-*+]|\d+[.)])\s+/

/** The component whose items and paragraphs are fragments. */
const FRAGMENTS_BLOCK = 'Fragments'

interface OpenBlock {
  colons: number
  /** The name the contract gives the component, or the written name of an unregistered one. */
  name: string
  fragments: boolean
  /** Fragments counted so far, the writing-order index of the next one. */
  count: number
  /** Diagram node ids to their fragment index, for the edges. */
  nodes: Map<string, number>
}

function attribute(attrs: string, name: string): string | undefined {
  const match = new RegExp(`(?:^|[\\s{])${name}=(?:"([^"]*)"|'([^']*)'|([^\\s}]+))`).exec(attrs)
  return match ? (match[1] ?? match[2] ?? match[3]) : undefined
}

/** Reveal fragment index under `line` (1-based), -1 before the first fragment of its slide. */
export function fragmentAtLine(raw: string, ranges: SlideRange[], line: number): number {
  const lines = raw.split('\n')
  let start = ranges[0]?.startLine ?? 1
  for (const range of ranges) {
    if (range.startLine > line)
      break
    start = range.startLine
  }
  const containers = new Set([FRAGMENTS_BLOCK, ...deckComponents().filter(component => component.fragment).map(component => component.parent)])
  const stack: OpenBlock[] = []
  let index = -1
  for (let n = start; n <= Math.min(line, lines.length); n++) {
    const text = lines[n - 1]!
    const close = BLOCK_CLOSE_RE.exec(text)
    if (close) {
      const colons = close[1]!.length
      for (let at = stack.length - 1; at >= 0; at--) {
        if (stack[at]!.colons === colons) {
          stack.length = at
          break
        }
      }
      continue
    }
    const open = BLOCK_OPEN_RE.exec(text)
    if (open) {
      const colons = open[1]!.length
      const component = deckComponentNamed(open[2]!)
      const name = component?.name ?? open[2]!
      const attrs = open[3] ?? ''
      // A block nests in one with more colons; anything else still open at this
      // level was left unclosed.
      const sibling = stack.findIndex(block => block.colons <= colons)
      if (sibling !== -1)
        stack.length = sibling
      const parent = stack[stack.length - 1]
      if (parent?.fragments && component?.fragment && component.parent === parent.name) {
        if (component.fragment === 'link') {
          const ends = [attribute(attrs, 'from'), attribute(attrs, 'to')]
            .map(id => (id === undefined ? undefined : parent.nodes.get(id)))
            .filter((value): value is number => value !== undefined)
          index = ends.length ? Math.max(...ends) : Math.max(parent.count - 1, 0)
        }
        else {
          const step = Number(attribute(attrs, ':?step') ?? '')
          const own = attribute(attrs, ':?step') !== undefined && !Number.isNaN(step) ? step : parent.count
          parent.count++
          const id = attribute(attrs, 'id')
          if (id)
            parent.nodes.set(id, own)
          index = own
        }
      }
      stack.push({
        colons,
        name,
        fragments: containers.has(name) && attribute(attrs, ':fragments') !== 'false',
        count: 0,
        nodes: new Map(),
      })
      continue
    }
    const top = stack[stack.length - 1]
    if (top?.name === FRAGMENTS_BLOCK && top.fragments && text.trim()) {
      const previous = lines[n - 2] ?? ''
      if (LIST_ITEM_RE.test(text) || !previous.trim() || BLOCK_OPEN_RE.test(previous))
        index = top.count++
    }
  }
  return index
}
