import type { ScannedLine } from './scan.ts'
import type { ParserId } from './schema.ts'
import { ANNOTATION_TAGS, componentKey, NOTES_COMPONENT } from './components.ts'
import { frontmatterLineCount } from './frontmatter.ts'
import { ATX_RE, COMPONENT_LINE_RE, MARKDOWN_IMAGE_LINE_RE, OTHER_BLOCK_RE, scan } from './scan.ts'
import { headingTextRange, lineStarts } from './text-edits.ts'

/**
 * The slide boundaries of a deck, read from its markdown text: the one
 * definition the renderers, the editor and the catalog share. A boundary is a
 * top-level line: fenced code and MDC block components (`::Name` … `::`) are
 * read as the content of the slide they sit in, as the MDC parser nests them.
 *
 * `heading`: the first `#` opens the title slide, which the next `##` closes;
 * outside it, a `##` or a thematic break opens a horizontal slide, and a
 * thematic break stays in the slide it opens. A `###` stacks a vertical slide
 * unless it opens its section. Setext headings (`===` or `---` under a
 * paragraph) read as `#` and `##`, and take their paragraph with them.
 *
 * `separator`: a `---` line opens a horizontal slide and a `----` line a
 * vertical one; the separator lines belong to no slide.
 */
export interface SlideSource {
  /** Reveal horizontal index. */
  h: number
  /** Reveal vertical index within the horizontal stack (0 when not stacked). */
  v: number
  /** 1-based line of the slide's first source line in the whole document. */
  startLine: number
  /** The slide's markdown. */
  text: string
}

interface Section {
  start: number
  verticals: number[]
}

function headingSections(scanned: ScannedLine[]): Section[] {
  const sections: Section[] = []
  let current: (Section & { firstContent?: number }) | undefined
  let sawTitle = false
  let inTitle = false

  // Content written before `start` in the current section, which a new heading closes.
  const hasContentBefore = (start: number) => current?.firstContent !== undefined && current.firstContent < start
  const openAt = (start: number) => {
    if (current && !hasContentBefore(start)) {
      current.start = Math.min(current.start, start)
      return
    }
    current = { start, verticals: [], firstContent: start }
    sections.push(current)
  }

  for (const line of scanned) {
    if (line.kind === 'blank')
      continue
    const start = line.from ?? line.index

    if (line.kind === 'h1' && !sawTitle) {
      sawTitle = true
      inTitle = true
      openAt(start)
    }
    else {
      if (line.kind === 'h2' && inTitle)
        inTitle = false
      if (!inTitle && (line.kind === 'h2' || line.kind === 'break'))
        openAt(start)
      else if (line.kind === 'h3' && hasContentBefore(start))
        current!.verticals.push(start)
      else if (!current)
        openAt(start)
    }
    current!.firstContent ??= start
  }
  return sections
}

function headingSlides(lines: string[], scanned: ScannedLine[]): SlideSource[] {
  const sections = headingSections(scanned)
  const slides: SlideSource[] = []
  sections.forEach((section, h) => {
    const end = sections[h + 1]?.start ?? lines.length
    const starts = [section.start, ...section.verticals]
    starts.forEach((start, v) => {
      const stop = starts[v + 1] ?? end
      slides.push({ h, v, startLine: start + 1, text: lines.slice(start, stop).join('\n') })
    })
  })
  return slides
}

interface Range { start: number, end: number }

function splitAt(scanned: ScannedLine[], range: Range, separator: string): Range[] {
  const parts: Range[] = []
  let start = range.start
  for (const line of scanned) {
    if (line.index < range.start || line.index >= range.end)
      continue
    if (line.kind !== 'nested' && line.text === separator) {
      parts.push({ start, end: line.index })
      start = line.index + 1
    }
  }
  parts.push({ start, end: range.end })
  return parts
}

function separatorSlides(lines: string[], scanned: ScannedLine[], from: number): SlideSource[] {
  const filled = (range: Range) => lines.slice(range.start, range.end).some(line => line.trim())
  const slides: SlideSource[] = []
  let h = 0
  for (const horizontal of splitAt(scanned, { start: from, end: lines.length }, '---').filter(filled)) {
    const verticals = splitAt(scanned, horizontal, '----').filter(filled)
    // A single vertical part keeps its whole section, as the MDC parser received it.
    const parts = verticals.length > 1 ? verticals : [horizontal]
    parts.forEach((part, v) => {
      slides.push({ h, v, startLine: part.start + 1, text: lines.slice(part.start, part.end).join('\n') })
    })
    h += 1
  }
  return slides
}

// The editor reads the slides of the same text several times per keystroke:
// the last cut is kept.
let lastCut: { raw: string, parser: ParserId, slides: readonly SlideSource[] } | undefined

export function splitSlides(raw: string, parser: ParserId): readonly SlideSource[] {
  if (lastCut?.raw === raw && lastCut.parser === parser)
    return lastCut.slides
  const lines = raw.split('\n')
  const from = frontmatterLineCount(raw)
  const scanned = scan(lines, from)
  const slides = parser === 'separator'
    ? separatorSlides(lines, scanned, from)
    : headingSlides(lines, scanned)
  lastCut = { raw, parser, slides }
  return slides
}

/** A slide's position and first source line, for the editor and the catalog. */
export interface SlideRange {
  startLine: number
  h: number
  v: number
}

/** The slide positions of a deck; an empty deck keeps one slide, after its frontmatter. */
export function slideRanges(raw: string, parser: ParserId): SlideRange[] {
  const ranges = splitSlides(raw, parser).map(({ startLine, h, v }) => ({ startLine, h, v }))
  return ranges.length ? ranges : [{ startLine: frontmatterLineCount(raw) + 1, h: 0, v: 0 }]
}

/** The offset in `raw` where the text of the slide at `h`, `v` starts, with that text. */
export function slideSourceAt(raw: string, parser: ParserId, h: number, v: number): { from: number, text: string } | undefined {
  const source = splitSlides(raw, parser).find(slide => slide.h === h && slide.v === v)
  if (!source)
    return undefined
  return { from: lineStarts(raw)[source.startLine - 1]!, text: source.text }
}

// The annotations a section keeps: `:layout` brings a media or a grid, so a
// slide that names one is a content slide.
const SECTION_ANNOTATION_RE = new RegExp(`^\\s*:(?:${ANNOTATION_TAGS.filter(tag => tag !== 'layout').join('|')})\\{[^}]*\\}\\s*$`)
const BLOCK_COMPONENT_RE = /^[ \t]*(:{2,})([a-z][\w-]*)(?:[^\w\n-][^\n]*)?\n[\s\S]*?^[ \t]*\1[ \t]*$/gim
const COMMENT_RE = /^\s*<!--.*-->\s*$/

const SECTION_TEXT_MAX_LENGTH = 140

/** Whether a line holds a component or an image alone. */
function isStandalone(line: string): boolean {
  return MARKDOWN_IMAGE_LINE_RE.test(line) || COMPONENT_LINE_RE.test(line)
}

/** The text a reader sees of a markdown line: no link targets, attributes, component names or markup. */
function displayedText(line: string): string {
  return line
    .replace(/\]\([^)]*\)/g, ']')
    .replace(/\{[^}]*\}/g, '')
    .replace(/(^|\s):[a-z][\w-]*/gi, '$1')
    .replace(/<[^>]+>|[*_`[\]]/g, '')
    .trim()
}

/**
 * Whether a slide is a section: its first heading is a `##`, and the slide
 * holds besides it at most one paragraph of text of at most 140 characters,
 * its speaker notes and the annotations other than `:layout`. A `##` slide
 * with more content is a content slide. `text` is the markdown of one slide,
 * as `splitSlides` gives it.
 */
export function isSectionSlide(text: string): boolean {
  const withoutNotes = text.replace(BLOCK_COMPONENT_RE, (block, _colons, name: string) =>
    componentKey(name) === componentKey(NOTES_COMPONENT) ? '' : block)
  let heading = false
  const paragraphs: string[] = []
  let inParagraph = false
  for (const line of scan(withoutNotes.split('\n'), 0)) {
    if (line.kind === 'blank' || line.kind === 'break' || SECTION_ANNOTATION_RE.test(line.text) || COMMENT_RE.test(line.text)) {
      inParagraph = false
      continue
    }
    if (line.kind === 'h2' && !heading) {
      heading = true
      // A setext heading lifts the paragraph above its underline.
      if (line.from !== undefined)
        paragraphs.pop()
      inParagraph = false
      continue
    }
    if (line.kind !== 'text' || OTHER_BLOCK_RE.test(line.text) || isStandalone(line.text))
      return false
    const text = displayedText(line.text)
    if (inParagraph)
      paragraphs[paragraphs.length - 1] += ` ${text}`
    else
      paragraphs.push(text)
    inParagraph = true
  }
  return heading && paragraphs.length <= 1 && (paragraphs[0]?.length ?? 0) <= SECTION_TEXT_MAX_LENGTH
}

/** The title of a slide: what a reader sees of it, and where its source sits in the slide text, marks left out. */
export interface SlideTitle {
  text: string
  from: number
  to: number
  underlined: boolean
}

const ESCAPE_RE = /\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g

/**
 * The first heading of a slide, as `splitSlides` cuts its text: a `#` heading
 * of any level, or a setext heading inside the slide, out of fenced code and
 * MDC blocks. An empty first heading gives no title.
 */
export function slideTitle(text: string): SlideTitle | undefined {
  const lines = text.split('\n')
  const starts = lineStarts(text)
  for (const line of scan(lines, 0)) {
    const underlined = line.from !== undefined
    if (line.kind === 'nested' || (!underlined && !ATX_RE.test(line.text)))
      continue
    const range = underlined
      ? { from: starts[line.from!]!, to: starts[line.index]! - 1 }
      : { from: starts[line.index]! + headingTextRange(line.text)!.from, to: starts[line.index]! + headingTextRange(line.text)!.to }
    const source = text.slice(range.from, range.to)
    const from = range.from + source.length - source.trimStart().length
    const to = range.to - (source.length - source.trimEnd().length)
    if (from >= to)
      return undefined
    return { text: displayedText(text.slice(from, to)).replace(ESCAPE_RE, '$1').replace(/\s+/g, ' '), from, to, underlined }
  }
  return undefined
}
