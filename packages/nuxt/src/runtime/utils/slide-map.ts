import type { ParserId } from '@vignettes/core/deck'

/**
 * Editor-only source-to-slide mapping. The published render path parses markdown
 * into slides through MDC (`slide-ast.ts`), which discards source positions — so
 * the editor cannot ask "which slide is line N in?". This module recomputes the
 * slide boundaries straight from the raw text, mirroring the two parsers closely
 * enough to drive the live preview to the slide under the cursor ("à peu près").
 *
 * It is deliberately heuristic and lossless-free: a wrong guess only mis-scrolls
 * the preview by a slide, never corrupts content. Keep the boundary rules in sync
 * with `parseSlides` / `parseSlidesFromSeparators`.
 */

export interface SlideRange {
  /** 1-based line where this slide's source starts (inclusive). */
  startLine: number
  /** Reveal horizontal index. */
  h: number
  /** Reveal vertical index within the horizontal stack (0 when not stacked). */
  v: number
}

/** Lines consumed by a leading `---\n…\n---` frontmatter block (0 if none). */
function frontmatterLineCount(lines: string[]): number {
  if (lines[0]?.trim() !== '---')
    return 0
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === '---')
      return i + 1
  }
  return 0
}

const FENCE_RE = /^\s*(?:```|~~~)/
const HR_RE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/
const HEADING_RE = /^(#{1,6})\s/

/**
 * Heading parser: the first `#` opens the title slide; every later `##` or
 * horizontal rule opens a new horizontal slide; `###` stacks a vertical slide.
 * Fenced code is skipped so `#`/`---` inside a block are not misread as breaks.
 */
function headingRanges(lines: string[], fmLines: number): SlideRange[] {
  const ranges: SlideRange[] = []
  let h = -1
  let v = 0
  let sawFirstH1 = false
  let inFence = false
  let slideOpen = false

  const openHorizontal = (line: number) => {
    h += 1
    v = 0
    ranges.push({ startLine: line + 1, h, v })
    slideOpen = true
  }

  for (let i = fmLines; i < lines.length; i++) {
    const line = lines[i]!
    if (FENCE_RE.test(line)) {
      inFence = !inFence
      if (!slideOpen)
        openHorizontal(i)
      continue
    }
    if (inFence)
      continue

    const heading = line.match(HEADING_RE)
    const level = heading?.[1]?.length ?? 0
    const isHr = HR_RE.test(line)

    if (level === 1 && !sawFirstH1) {
      sawFirstH1 = true
      openHorizontal(i)
    }
    else if (level === 2 || isHr) {
      openHorizontal(i)
    }
    else if (level === 3 && slideOpen) {
      // Vertical stack under the current horizontal slide.
      v += 1
      ranges.push({ startLine: i + 1, h, v })
    }
    else if (!slideOpen && line.trim().length > 0) {
      // Content before any heading forms the first (title) slide.
      openHorizontal(i)
    }
  }

  return ranges.length > 0 ? ranges : [{ startLine: fmLines + 1, h: 0, v: 0 }]
}

interface Chunk {
  /** 0-based array index of the chunk's first line. */
  start: number
  lines: string[]
}

/** Split a line window into chunks at every line that trims to `sep`. */
function splitAt(lines: string[], from: number, sep: string): Chunk[] {
  const chunks: Chunk[] = []
  let cur: Chunk = { start: from, lines: [] }
  for (let i = from; i < lines.length; i++) {
    const line = lines[i]!
    if (line.trim() === sep) {
      chunks.push(cur)
      cur = { start: i + 1, lines: [] }
    }
    else {
      cur.lines.push(line)
    }
  }
  chunks.push(cur)
  return chunks
}

const nonEmpty = (c: Chunk) => c.lines.some(l => l.trim().length > 0)

/**
 * Separator parser: `---` opens a horizontal slide, `----` a vertical one; empty
 * chunks are dropped (mirrors the parser's `.split().filter()`). A horizontal
 * chunk only stacks when it yields more than one non-empty vertical part.
 */
function separatorRanges(lines: string[], fmLines: number): SlideRange[] {
  const ranges: SlideRange[] = []
  let h = 0
  for (const chunk of splitAt(lines, fmLines, '---').filter(nonEmpty)) {
    // A horizontal chunk has no `---` inside, so its lines are contiguous from
    // `chunk.start`; sub-split by `----` and lift the offsets back to absolute.
    const verticals = splitAt(chunk.lines, 0, '----')
      .map(v => ({ ...v, start: v.start + chunk.start }))
      .filter(nonEmpty)

    if (verticals.length > 1) {
      verticals.forEach((part, v) => ranges.push({ startLine: part.start + 1, h, v }))
    }
    else {
      ranges.push({ startLine: chunk.start + 1, h, v: 0 })
    }
    h += 1
  }
  return ranges.length > 0 ? ranges : [{ startLine: fmLines + 1, h: 0, v: 0 }]
}

export function slideRanges(raw: string, parser: ParserId): SlideRange[] {
  const lines = raw.split('\n')
  const fmLines = frontmatterLineCount(lines)
  return parser === 'separator'
    ? separatorRanges(lines, fmLines)
    : headingRanges(lines, fmLines)
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

// ── Fragments ────────────────────────────────────────────────────────────────

/**
 * Line-to-fragment mapping, as heuristic as the slide boundaries above: the
 * fragment index Reveal gives the component under the cursor, so the preview can
 * open the slide at that step. Counted from the source in writing order, or by
 * their `step`: the `::Zone` of a JsonTour, the `::Step` of a Scheme, the `::Node`
 * and `::Edge` of a Diagram, and each item or paragraph of a `::Fragments` block.
 * A container with `:fragments="false"` counts nothing.
 */

const BLOCK_OPEN_RE = /^\s*(:{2,})([A-Z][\w-]*)(\{[^}]*\})?/i
const BLOCK_CLOSE_RE = /^\s*(:{2,})\s*$/
const LIST_ITEM_RE = /^\s*(?:[-*+]|\d+[.)])\s+/

/** The components whose children are fragments, and which children. */
const FRAGMENT_CONTAINERS: Record<string, string[]> = {
  jsontour: ['zone'],
  scheme: ['step'],
  diagram: ['node', 'edge'],
  fragments: [],
}

interface OpenBlock {
  colons: number
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
      const name = open[2]!.toLowerCase()
      const attrs = open[3] ?? ''
      // A block nests in one with more colons; anything else still open at this
      // level was left unclosed.
      const sibling = stack.findIndex(block => block.colons <= colons)
      if (sibling !== -1)
        stack.length = sibling
      const parent = stack[stack.length - 1]
      if (parent?.fragments && FRAGMENT_CONTAINERS[parent.name]?.includes(name)) {
        if (name === 'edge') {
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
        fragments: name in FRAGMENT_CONTAINERS && attribute(attrs, ':fragments') !== 'false',
        count: 0,
        nodes: new Map(),
      })
      continue
    }
    const top = stack[stack.length - 1]
    if (top?.name === 'fragments' && top.fragments && text.trim()) {
      const previous = lines[n - 2] ?? ''
      if (LIST_ITEM_RE.test(text) || !previous.trim() || BLOCK_OPEN_RE.test(previous))
        index = top.count++
    }
  }
  return index
}
