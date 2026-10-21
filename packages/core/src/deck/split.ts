import type { ParserId } from './parser.ts'
import { readAttribute } from './attributes.ts'
import { componentKey } from './components.ts'

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

const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/
const BLOCK_OPEN_RE = /^\s*(:{2,})[a-z]/i
const BLOCK_CLOSE_RE = /^\s*(:{2,})\s*$/
const ATX_RE = /^ {0,3}(#{1,6})(?:[ \t]|$)/
const THEMATIC_BREAK_RE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/
const SETEXT_H1_RE = /^ {0,3}=+[ \t]*$/
const SETEXT_H2_RE = /^ {0,3}-+[ \t]*$/
// Lines that open a block other than a paragraph, so no setext underline lifts them.
const OTHER_BLOCK_RE = /^ {0,3}(?:[-*+>|<#]|\d+[.)])/

type Kind = 'blank' | 'nested' | 'text' | 'h1' | 'h2' | 'h3' | 'break'

interface ScannedLine {
  /** 0-based index in the whole document. */
  index: number
  kind: Kind
  /** The line as written, without a trailing carriage return. */
  text: string
  /** For a setext heading, the first line of the paragraph it lifts. */
  from?: number
}

function frontmatterLineCount(raw: string): number {
  const match = FRONTMATTER_RE.exec(raw)
  if (!match)
    return 0
  const lines = match[0].split('\n').length
  return match[0].endsWith('\n') ? lines - 1 : lines
}

function isFenceClose(line: string, fence: string): boolean {
  const match = FENCE_RE.exec(line)
  return Boolean(match && match[1]![0] === fence[0] && match[1]!.length >= fence.length && !line.slice(match[0].length).trim())
}

/** Classifies each line after the frontmatter; fenced code and MDC blocks are `nested`. */
function scan(lines: string[], from: number): ScannedLine[] {
  const scanned: ScannedLine[] = []
  let fence: string | undefined
  const blocks: number[] = []
  let paragraph: number | undefined

  for (let index = from; index < lines.length; index++) {
    const text = lines[index]!.replace(/\r$/, '')
    const push = (kind: Kind, extra?: Partial<ScannedLine>) => scanned.push({ index, kind, text, ...extra })

    if (fence) {
      if (isFenceClose(text, fence))
        fence = undefined
      push('nested')
      continue
    }
    const fenceOpen = FENCE_RE.exec(text)
    if (fenceOpen && !blocks.length) {
      fence = fenceOpen[1]
      paragraph = undefined
      push('nested')
      continue
    }
    const close = BLOCK_CLOSE_RE.exec(text)
    if (close && blocks.length) {
      const at = blocks.lastIndexOf(close[1]!.length)
      if (at !== -1)
        blocks.length = at
      push('nested')
      continue
    }
    const open = BLOCK_OPEN_RE.exec(text)
    if (open) {
      blocks.push(open[1]!.length)
      paragraph = undefined
      push('nested')
      continue
    }
    if (blocks.length) {
      if (fenceOpen)
        fence = fenceOpen[1]
      push('nested')
      continue
    }

    if (!text.trim()) {
      paragraph = undefined
      push('blank')
      continue
    }
    if (paragraph !== undefined && (SETEXT_H1_RE.test(text) || SETEXT_H2_RE.test(text))) {
      push(SETEXT_H1_RE.test(text) ? 'h1' : 'h2', { from: paragraph })
      paragraph = undefined
      continue
    }
    const atx = ATX_RE.exec(text)
    if (atx) {
      const level = atx[1]!.length
      push(level === 1 ? 'h1' : level === 2 ? 'h2' : level === 3 ? 'h3' : 'text')
      paragraph = undefined
      continue
    }
    if (THEMATIC_BREAK_RE.test(text)) {
      push('break')
      paragraph = undefined
      continue
    }
    if (OTHER_BLOCK_RE.test(text))
      paragraph = undefined
    else if (paragraph === undefined)
      paragraph = index
    push('text')
  }
  return scanned
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

export function splitSlides(raw: string, parser: ParserId): SlideSource[] {
  const lines = raw.split('\n')
  const from = frontmatterLineCount(raw)
  const scanned = scan(lines, from)
  return parser === 'separator'
    ? separatorSlides(lines, scanned, from)
    : headingSlides(lines, scanned)
}

/** A component name as written in the source: `::Name`, `:::Name`, `:name{…}`. */
export interface ComponentMention {
  name: string
  /** 1-based line in the whole document. */
  line: number
  /** 0-based column of the first colon. */
  column: number
  /** Length of the colons and the name. */
  length: number
}

const DIRECTIVE_RE = /(^|[\s([])(:+)([a-z][\w-]*)/gi
const INLINE_CODE_RE = /(`+)[^`]+\1/g

/**
 * The lines of a deck outside the frontmatter and fenced code, with inline code
 * blanked so the columns stay those of the source.
 */
function* proseLines(raw: string): Generator<{ line: number, prose: string }> {
  const lines = raw.split('\n')
  let fence: string | undefined
  for (let index = frontmatterLineCount(raw); index < lines.length; index++) {
    const text = lines[index]!.replace(/\r$/, '')
    if (fence) {
      if (isFenceClose(text, fence))
        fence = undefined
      continue
    }
    const fenceOpen = FENCE_RE.exec(text)
    if (fenceOpen) {
      fence = fenceOpen[1]
      continue
    }
    yield { line: index + 1, prose: text.replace(INLINE_CODE_RE, code => ' '.repeat(code.length)) }
  }
}

/**
 * The places where the components named in `names` are written, outside the
 * frontmatter, fenced code and inline code. Names compare as `componentKey`
 * compares them.
 */
export function componentMentions(raw: string, names: Iterable<string>): ComponentMention[] {
  const wanted = new Set([...names].map(componentKey))
  if (!wanted.size)
    return []
  const mentions: ComponentMention[] = []
  for (const { line, prose } of proseLines(raw)) {
    for (const match of prose.matchAll(DIRECTIVE_RE)) {
      const [, before, colons, name] = match
      if (wanted.has(componentKey(name!)))
        mentions.push({ name: name!, line, column: match.index + before!.length, length: colons!.length + name!.length })
    }
  }
  return mentions
}

/** An attribute written in the source that `readAttribute` refuses. */
export interface AttributeMention {
  name: string
  reason: 'url' | 'binding'
  /** 1-based line in the whole document. */
  line: number
  /** 0-based column of the attribute, and length of its text. */
  column: number
  length: number
}

const ATTRIBUTE_BLOCK_RE = /\{([^{}]*)\}/g
// A quoted value keeps its backslash escapes, as `\'` in `'"x\'y"'`.
const ATTRIBUTE_RE = /(^|\s)([:@]?[\w:.-]+)=(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^\s"']+))/g
const BLOCK_TAG_RE = /:+([a-z][\w-]*)(?:\[[^\]]*\])?$/i
// The destination of a markdown link keeps one level of balanced parentheses.
const MARKDOWN_LINK_RE = /(!?)\[[^\]]*\]\(\s*<?((?:[^\s()<>]|\([^\s()]*\))+)/g

/**
 * The attributes of the source that the deck refuses: in the `{…}` block of a
 * component, an annotation or a span, and the address of an inline markdown
 * link or image. Outside the frontmatter, fenced code and inline code.
 */
export function attributeMentions(raw: string): AttributeMention[] {
  const mentions: AttributeMention[] = []
  const check = (tag: string, name: string, value: string, line: number, column: number, length: number) => {
    const reading = readAttribute(tag, name, value)
    if ('refused' in reading)
      mentions.push({ name, reason: reading.refused, line, column, length })
  }
  for (const { line, prose } of proseLines(raw)) {
    for (const block of prose.matchAll(ATTRIBUTE_BLOCK_RE)) {
      const before = prose.slice(0, block.index)
      const tag = BLOCK_TAG_RE.exec(before)?.[1] ?? (before.endsWith(')') ? 'a' : 'span')
      for (const attribute of block[1]!.matchAll(ATTRIBUTE_RE)) {
        const [text, space, name, ...values] = attribute
        const column = block.index + 1 + attribute.index + space!.length
        const value = values.find(value => value !== undefined)!.replace(/\\(.)/g, '$1')
        check(tag, name!, value, line, column, text.length - space!.length)
      }
    }
    for (const link of prose.matchAll(MARKDOWN_LINK_RE)) {
      const [text, bang, url] = link
      const image = bang === '!'
      check(image ? 'img' : 'a', image ? 'src' : 'href', url!, line, link.index + text.length - url!.length, url!.length)
    }
  }
  return mentions
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
