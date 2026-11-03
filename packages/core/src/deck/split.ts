import type { BodyMediaLayoutSpec, ComponentAttribute, DeckComponent } from './components.ts'
import type { LayoutIssueKind } from './layout.ts'
import type { ParserId } from './parser.ts'
import { isRefusedEmbed, readAttribute } from './attributes.ts'
import { ANNOTATION_TAGS, componentKey, DECK_ANNOTATIONS, deckComponents, NOTES_COMPONENT } from './components.ts'
import { frontmatterLineCount } from './frontmatter.ts'
import { bodyMediaLayout, LAYOUT_ATTRIBUTES, MARKDOWN_IMAGE_LAYOUT, readLayout } from './layout.ts'

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

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/
const BLOCK_OPEN_RE = /^(\s*)(:{2,})([a-z][\w-]*)/i
const BLOCK_CLOSE_RE = /^\s*(:{2,})\s*$/
const ATX_RE = /^ {0,3}(#{1,6})(?:[ \t]|$)/
const THEMATIC_BREAK_RE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/
const SETEXT_H1_RE = /^ {0,3}=+[ \t]*$/
const SETEXT_H2_RE = /^ {0,3}-+[ \t]*$/
// Lines that open a block other than a paragraph, so no setext underline lifts
// them: a quote, a table, a heading, a list item, an html comment, an html
// block tag and a line of html tags alone.
const HTML_BLOCK_TAGS = 'address|article|aside|blockquote|details|div|dl|figure|footer|header|hr|li|main|nav|ol|p|pre|section|table|ul|h[1-6]'
const OTHER_BLOCK_RE = new RegExp(`^ {0,3}(?:[>|]|#{1,6}(?:[ \\t]|$)|[-*+](?:[ \\t]|$)|\\d{1,9}[.)](?:[ \\t]|$)|<!--|<\\/?(?:${HTML_BLOCK_TAGS})(?:[\\s/>]|$)|(?:<\\/?[a-z][\\w-]*(?:\\s[^>]*)?>\\s*)+$)`, 'i')

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

function isFenceClose(line: string, fence: string): boolean {
  const match = FENCE_RE.exec(line)
  return Boolean(match && match[1]![0] === fence[0] && match[1]!.length >= fence.length && !line.slice(match[0].length).trim())
}

/** A block that a `::Name` line opens, placed by that line. */
export interface OpenBlock {
  name: string
  /** The colons that open the block, which its closing line repeats. */
  colons: string
  /** 1-based line in the whole document. */
  line: number
  /** 0-based column of `::Name`, and its length. */
  column: number
  length: number
}

interface WalkedLine {
  /** 0-based index in the whole document. */
  index: number
  /** The line as written, without a trailing carriage return. */
  text: string
  /** The line belongs to fenced code, its fences included. */
  code: boolean
  /** The line belongs to fenced code or to an MDC block, its opening and closing lines included. */
  nested: boolean
  /** The blocks still open once the line is read, until the walk reads the next line. */
  open: readonly OpenBlock[]
}

/** Reads the lines from `from` on, following fenced code and the MDC blocks. */
function* walk(lines: string[], from: number): Generator<WalkedLine> {
  const open: OpenBlock[] = []
  let fence: string | undefined
  for (let index = from; index < lines.length; index++) {
    const text = lines[index]!.replace(/\r$/, '')
    const fenceOpen = fence ? undefined : FENCE_RE.exec(text)
    const close = fence || fenceOpen ? undefined : BLOCK_CLOSE_RE.exec(text)
    const name = fence || fenceOpen || close ? undefined : BLOCK_OPEN_RE.exec(text)
    const code = Boolean(fence || fenceOpen)
    const nested = code || Boolean(name) || open.length > 0
    if (fence && isFenceClose(text, fence)) {
      fence = undefined
    }
    else if (fenceOpen) {
      fence = fenceOpen[1]
    }
    else if (close && open.length) {
      const at = open.map(block => block.colons.length).lastIndexOf(close[1]!.length)
      if (at !== -1)
        open.length = at
    }
    else if (name) {
      open.push({ name: name[3]!, colons: name[2]!, line: index + 1, column: name[1]!.length, length: name[2]!.length + name[3]!.length })
    }
    yield { index, text, code, nested, open }
  }
}

/** Classifies each line after the frontmatter; fenced code and MDC blocks are `nested`. */
function scan(lines: string[], from: number): ScannedLine[] {
  const scanned: ScannedLine[] = []
  let paragraph: number | undefined

  for (const { index, text, nested } of walk(lines, from)) {
    const push = (kind: Kind, extra?: Partial<ScannedLine>) => scanned.push({ index, kind, text, ...extra })

    if (nested) {
      paragraph = undefined
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
  for (const { index, text, code } of walk(raw.split('\n'), frontmatterLineCount(raw))) {
    if (!code)
      yield { line: index + 1, prose: text.replace(INLINE_CODE_RE, inline => ' '.repeat(inline.length)) }
  }
}

/**
 * The blocks that no closing line ends before the end of the text, which MDC
 * closes at the end of the text, so they take in the slides that follow them.
 */
export function unclosedBlocks(raw: string): OpenBlock[] {
  let open: readonly OpenBlock[] = []
  for (const line of walk(raw.split('\n'), frontmatterLineCount(raw)))
    open = line.open
  return [...open]
}

/**
 * The 1-based line after which a new slide goes, from the 1-based `line` of the
 * caret: the line that closes the outermost block around it, or the last line
 * when that block stays open. Undefined outside a block.
 */
export function blockEndAround(raw: string, line: number): number | undefined {
  const lines = raw.split('\n')
  let outer: OpenBlock | undefined
  for (const { index, open } of walk(lines, frontmatterLineCount(raw))) {
    if (index + 1 === line && open.length)
      outer = open[0]
    if (outer && index + 1 > line && !open.includes(outer))
      return index + 1
  }
  return outer ? lines.length : undefined
}

/** The 0-based indexes of the lines of a markdown text that belong to fenced code, its fences included. */
export function codeLines(markdown: string): Set<number> {
  const code = new Set<number>()
  for (const { index, code: fenced } of walk(markdown.split('\n'), 0)) {
    if (fenced)
      code.add(index)
  }
  return code
}

/** The blocks open around the 1-based `line`, outermost first: those the lines above it opened and did not close. */
export function blocksAround(raw: string, line: number): OpenBlock[] {
  let around: OpenBlock[] = []
  for (const walked of walk(raw.split('\n'), frontmatterLineCount(raw))) {
    if (walked.index + 1 >= line)
      break
    around = [...walked.open]
  }
  return around
}

/** A directive as written in the source, with its colons: `::Quote`, `:::Columns`, `:pretitle`. */
export interface DirectiveMention extends ComponentMention {
  colons: string
  /** 0-based columns of its `{…}` block when it has one, the closing brace included; to the end of the line when the block stays open. */
  attributes?: { from: number, to: number }
}

/** The directives written in a deck, outside the frontmatter, fenced code and inline code. */
export function directiveMentions(raw: string): DirectiveMention[] {
  const mentions: DirectiveMention[] = []
  for (const { line, prose } of proseLines(raw)) {
    for (const match of prose.matchAll(DIRECTIVE_RE)) {
      const [, before, colons, name] = match
      const column = match.index + before!.length
      const length = colons!.length + name!.length
      const close = prose[column + length] === '{' ? attributesEnd(prose, column + length + 1) : undefined
      const attributes = close === undefined ? undefined : { from: column + length, to: typeof close === 'number' ? close + 1 : prose.length }
      mentions.push({ name: name!, colons: colons!, line, column, length, ...(attributes && { attributes }) })
    }
  }
  return mentions
}

/**
 * The places where the components named in `names` are written, outside the
 * frontmatter, fenced code and inline code. Names compare as `componentKey`
 * compares them.
 */
export function componentMentions(raw: string, names: Iterable<string>): ComponentMention[] {
  const wanted = new Set([...names].map(componentKey))
  return directiveMentions(raw)
    .filter(mention => wanted.has(componentKey(mention.name)))
    .map(({ name, line, column, length }) => ({ name, line, column, length }))
}

/**
 * An attribute written in the source that `readAttribute` refuses (`url`,
 * `binding`), or whose address the page refuses to load (`http`, see
 * `isRefusedEmbed`).
 */
export interface AttributeMention {
  name: string
  reason: 'url' | 'binding' | 'http'
  /** 1-based line in the whole document. */
  line: number
  /** 0-based column of the attribute, and length of its text. */
  column: number
  length: number
}

const ATTRIBUTE_BLOCK_RE = /\{([^{}]*)\}/g
// A quoted value keeps its backslash escapes, as `\'` in `'"x\'y"'`. An
// attribute written alone has no value.
const ATTRIBUTE_RE = /(^|\s)([:@]?[\w:.-]+)(?:=(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^\s"']+)))?/g

interface WrittenAttribute {
  name: string
  /** Undefined for an attribute written alone. */
  value?: string
  /** 0-based column in the line, and length of the attribute's text. */
  column: number
  length: number
}

/** The attributes of the `{…}` block whose content starts at `offset` in its line. */
function* blockAttributes(content: string, offset: number): Generator<WrittenAttribute> {
  for (const attribute of content.matchAll(ATTRIBUTE_RE)) {
    const [text, space, name, ...values] = attribute
    yield {
      name: name!,
      // MDC decodes `&quot;`, which `attributeSource` writes in a value holding both quotes.
      value: values.find(value => value !== undefined)?.replace(/\\(.)/g, '$1').replaceAll('&quot;', '"'),
      column: offset + attribute.index + space!.length,
      length: text.length - space!.length,
    }
  }
}
const BLOCK_TAG_RE = /:+([a-z][\w-]*)(?:\[[^\]]*\])?$/i
// The destination of a markdown link keeps one level of balanced parentheses.
const MARKDOWN_LINK_RE = /(!?)\[[^\]]*\]\(\s*<?((?:[^\s()<>]|\([^\s()]*\))+)/g

/** A value written in the source: an attribute's, or the address of a markdown link or image. */
export interface ValueMention {
  /** The element the value goes to: the directive's name, `img` or `a`. */
  tag: string
  name: string
  value: string
  /** 1-based line in the whole document. */
  line: number
  /** 0-based column of the attribute or the address, and length of its text. */
  column: number
  length: number
}

/**
 * The values written in the `{…}` block of a component, an annotation or a
 * span, and the addresses of the inline markdown links and images. Outside
 * the frontmatter, fenced code and inline code.
 */
export function valueMentions(raw: string): ValueMention[] {
  const mentions: ValueMention[] = []
  for (const { line, prose } of proseLines(raw)) {
    for (const block of prose.matchAll(ATTRIBUTE_BLOCK_RE)) {
      const before = prose.slice(0, block.index)
      const tag = BLOCK_TAG_RE.exec(before)?.[1] ?? (before.endsWith(')') ? 'a' : 'span')
      for (const { name, value, column, length } of blockAttributes(block[1]!, block.index + 1)) {
        if (value !== undefined)
          mentions.push({ tag, name, value, line, column, length })
      }
    }
    for (const link of prose.matchAll(MARKDOWN_LINK_RE)) {
      const [text, bang, url] = link
      const image = bang === '!'
      mentions.push({ tag: image ? 'img' : 'a', name: image ? 'src' : 'href', value: url!, line, column: link.index + text.length - url!.length, length: url!.length })
    }
  }
  return mentions
}

/** The written values that the deck refuses, or whose address the page refuses to load. */
export function attributeMentions(raw: string): AttributeMention[] {
  const mentions: AttributeMention[] = []
  for (const { tag, name, value, line, column, length } of valueMentions(raw)) {
    const reading = readAttribute(tag, name, value)
    if ('refused' in reading)
      mentions.push({ name, reason: reading.refused, line, column, length })
    else if (isRefusedEmbed(tag, reading.name, reading.value))
      mentions.push({ name, reason: 'http', line, column, length })
  }
  return mentions
}

/** An attribute written in a `:layout` annotation: its value, `true` when written alone, and its place in the line. */
export interface LayoutAnnotationAttribute {
  name: string
  value: string | true
  /** 0-based column, and length of the attribute's text. */
  column: number
  length: number
}

/** A `:layout{…}` annotation written in the source. */
export interface LayoutAnnotation {
  /** 1-based line in the whole document. */
  line: number
  /** 0-based column of `:layout`, and length of the annotation's text. */
  column: number
  length: number
  attributes: LayoutAnnotationAttribute[]
}

const LAYOUT_ANNOTATION_RE = /:layout\{([^{}]*)\}/g

/**
 * A `{…}` of attributes written so that MDC cannot read it as written: a
 * closing brace or quote missing, which shows the directive as text, or a
 * value between typographic quotes, which MDC cuts at its first space.
 */
export interface MalformedAttributes {
  /** The name of the directive. */
  name: string
  reason: 'brace' | 'quote' | 'typographic'
  /** 1-based line in the whole document. */
  line: number
  /** 0-based column of the directive, and length of what it covers on its line. */
  column: number
  length: number
}

const DIRECTIVE_ATTRIBUTES_RE = /(^|[\s([])(:+)([a-z][\w-]*)\{/gi
const TYPOGRAPHIC_QUOTE_RE = /[«»“”„]/
const QUOTED_VALUE_RE = /"(?:[^"\\]|\\.)*"/g

/** The index of the brace that closes the attributes opened at `open`, outside the quoted values; else what is missing. */
function attributesEnd(prose: string, open: number): number | 'brace' | 'quote' {
  let quoted = false
  for (let index = open; index < prose.length; index++) {
    if (prose[index] === '\\')
      index++
    else if (prose[index] === '"')
      quoted = !quoted
    else if (prose[index] === '}' && !quoted)
      return index
  }
  return quoted ? 'quote' : 'brace'
}

/** The directives whose attributes MDC cannot read, outside frontmatter and code. */
export function malformedAttributeMentions(raw: string): MalformedAttributes[] {
  const mentions: MalformedAttributes[] = []
  for (const { line, prose } of proseLines(raw)) {
    for (const match of prose.matchAll(DIRECTIVE_ATTRIBUTES_RE)) {
      const column = match.index + match[1]!.length
      const open = match.index + match[0].length
      const end = attributesEnd(prose, open)
      const reason = typeof end === 'number'
        ? TYPOGRAPHIC_QUOTE_RE.test(prose.slice(open, end).replace(QUOTED_VALUE_RE, '')) ? 'typographic' : undefined
        : end
      if (reason)
        mentions.push({ name: match[3]!, reason, line, column, length: (typeof end === 'number' ? end + 1 : prose.length) - column })
    }
  }
  return mentions
}

/** An attribute written in the `{…}` block of a component, placed in the source. */
export interface ComponentAttributeMention {
  /** The component as written: `Scheme`. */
  tag: string
  /** The attribute as written: `:arrows`, `size`. */
  name: string
  /** Undefined for an attribute written alone. */
  value?: string
  /** 1-based line in the whole document. */
  line: number
  /** 0-based column of the attribute, and length of its text. */
  column: number
  length: number
}

/** The attributes written in the `{…}` blocks of the directives, outside the frontmatter, fenced code and inline code. */
export function componentAttributeMentions(raw: string): ComponentAttributeMention[] {
  const mentions: ComponentAttributeMention[] = []
  for (const { line, prose } of proseLines(raw)) {
    for (const match of prose.matchAll(DIRECTIVE_ATTRIBUTES_RE)) {
      const open = match.index + match[0].length
      const end = attributesEnd(prose, open)
      const content = prose.slice(open, typeof end === 'number' ? end : prose.length)
      for (const attribute of blockAttributes(content, open))
        mentions.push({ tag: match[3]!, line, ...attribute })
    }
  }
  return mentions
}

/** The registered component a deck names `tag`, by its name or an alias. */
export function deckComponentNamed(tag: string): DeckComponent | undefined {
  const key = componentKey(tag)
  return deckComponents().find(component => [component.name, ...(component.aliases ?? [])].some(name => componentKey(name) === key))
}

// Attributes every element takes: MDC's `.class` and `#id` shorthands, and the HTML ones.
const PASSTHROUGH_ATTRIBUTE_RE = /^(?:[.#]|(?:class|id|style)$|(?:data|aria)-)/

/** A directive that declares its attributes: a registered component, or an annotation. */
export interface AttributedDirective {
  name: string
  attributes?: readonly ComponentAttribute[]
  docs?: string
}

/** The component or the annotation a deck names `tag`. */
export function attributedDirective(tag: string): AttributedDirective | undefined {
  const annotation = DECK_ANNOTATIONS.find(candidate => candidate.tag === tag)
  if (!annotation)
    return deckComponentNamed(tag)
  return { name: annotation.tag, attributes: annotation.tag === 'layout' ? LAYOUT_ATTRIBUTES : annotation.attributes, docs: annotation.docs }
}

/** The declared attribute a written name reaches: Vue reads `node-width` as `nodeWidth`. */
export function attributeNamed(directive: AttributedDirective, name: string): ComponentAttribute | undefined {
  const key = componentKey(name.replace(/^:/, ''))
  return directive.attributes?.find(attribute => componentKey(attribute.name) === key)
}

/**
 * An attribute that its component leaves unused: a name it does not declare
 * (`unknown`), or `"false"` written to a `true`/`false` attribute without the
 * colon (`false-text`), which the component reads as a text, so as true.
 */
export interface ComponentAttributeIssue {
  kind: 'unknown' | 'false-text'
  /** The component, by its declared name. */
  component: string
  /** The attribute as written. */
  name: string
  line: number
  column: number
  length: number
}

/**
 * The attributes of the components of a deck that the component leaves unused,
 * for the components that declare their attributes. `layoutMentions` reports
 * those of `:layout`, which `readLayout` reads.
 */
export function componentAttributeIssues(raw: string): ComponentAttributeIssue[] {
  const issues: ComponentAttributeIssue[] = []
  for (const mention of componentAttributeMentions(raw)) {
    const component = mention.tag === 'layout' ? undefined : attributedDirective(mention.tag)
    if (!component?.attributes || PASSTHROUGH_ATTRIBUTE_RE.test(mention.name) || /^(?:v-|@)/.test(mention.name))
      continue
    const attribute = attributeNamed(component, mention.name)
    const kind = !attribute
      ? 'unknown'
      : attribute.boolean && !mention.name.startsWith(':') && mention.value === 'false' ? 'false-text' : undefined
    if (kind)
      issues.push({ kind, component: component.name, name: mention.name, line: mention.line, column: mention.column, length: mention.length })
  }
  return issues
}

/** The `:layout` annotations of a deck, outside the frontmatter, fenced code and inline code. */
export function layoutAnnotations(raw: string): LayoutAnnotation[] {
  const annotations: LayoutAnnotation[] = []
  for (const { line, prose } of proseLines(raw)) {
    for (const block of prose.matchAll(LAYOUT_ANNOTATION_RE)) {
      const attributes = [...blockAttributes(block[1]!, block.index + ':layout{'.length)]
        .map(({ value, ...attribute }) => ({ ...attribute, value: value ?? true as const }))
      annotations.push({ line, column: block.index, length: block[0].length, attributes })
    }
  }
  return annotations
}

/** The attributes of an annotation, by name, as `readLayout` reads them. */
export function layoutAnnotationValues(annotation: LayoutAnnotation): Record<string, string | true> {
  return Object.fromEntries(annotation.attributes.map(attribute => [attribute.name, attribute.value]))
}

/** A replacement of the text from `from` to `to`, offsets in the deck text. */
export interface TextChange {
  from: number
  to: number
  insert: string
}

/**
 * The change that writes `source` in place of an annotation of `raw`. An empty
 * `source` removes the annotation, and the annotation alone on its line goes
 * with its line and the blank line after it.
 */
export function layoutAnnotationChange(raw: string, annotation: LayoutAnnotation, source: string): TextChange {
  const lines = raw.split('\n')
  const lineFrom = lines.slice(0, annotation.line - 1).reduce((offset, line) => offset + line.length + 1, 0)
  const text = lines[annotation.line - 1]!
  const from = lineFrom + annotation.column
  const to = from + annotation.length
  if (source || text.trim() !== raw.slice(from, to))
    return { from, to, insert: source }
  const next = lines[annotation.line]
  const end = lineFrom + text.length + (next !== undefined && !next.trim() ? next.length + 1 : 0)
  return { from: lineFrom, to: Math.min(end + 1, raw.length), insert: '' }
}

/** An attribute of a `:layout` annotation that `readLayout` leaves out, placed in the source; `legacyMentions` places the attributes it translates. */
export interface LayoutMention {
  kind: Exclude<LayoutIssueKind, 'legacy'>
  attribute: string
  /** 1-based line, 0-based column and length of the marked text: the attribute, or the annotation when it names no attribute. */
  line: number
  column: number
  length: number
}

/** The issues `readLayout` finds in each `:layout` annotation of a deck, placed on their attribute. */
export function layoutMentions(raw: string): LayoutMention[] {
  return layoutAnnotations(raw).flatMap((annotation) => {
    const { issues } = readLayout(layoutAnnotationValues(annotation))
    return issues.flatMap(({ kind, attribute }) => kind === 'legacy' ? [] : [{ kind, attribute }]).map((issue) => {
      const written = annotation.attributes.find(attribute => attribute.name === issue.attribute)
      return {
        ...issue,
        line: annotation.line,
        column: written?.column ?? annotation.column,
        length: written?.length ?? annotation.length,
      }
    })
  })
}

// The annotations a section keeps: `:layout` brings a media or a grid, so a
// slide that names one is a content slide.
const SECTION_ANNOTATION_RE = new RegExp(`^\\s*:(?:${ANNOTATION_TAGS.filter(tag => tag !== 'layout').join('|')})\\{[^}]*\\}\\s*$`)
const BLOCK_COMPONENT_RE = /^[ \t]*(:{2,})([a-z][\w-]*)(?:[^\w\n-][^\n]*)?\n[\s\S]*?^[ \t]*\1[ \t]*$/gim
const COMMENT_RE = /^\s*<!--.*-->\s*$/
// A line that holds an image alone, with its address, its title and its MDC attributes.
const MARKDOWN_IMAGE_LINE_RE = /^\s*!\[([^\]]*)\]\(\s*<?([^\s<>)]+)>?([ \t][^)]*)?\)(?:\{([^{}]*)\})?\s*$/
// A line that holds a component alone, with its label and its attributes.
const COMPONENT_LINE_RE = /^\s*(:+)([a-z][\w-]*)(\[[^\]]*\])?(?:\{([^{}]*)\})?\s*$/i
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

/** A media written alone on a top-level line of a slide body, or as a block of its own. */
export interface BodyMedia {
  /** The component that draws it, by its declared name; `image` for a markdown image. */
  component: string
  /** Its attributes as written; a markdown image gives `src` and `alt`. */
  attributes: Record<string, string | true>
  /** 1-based first and last lines in the slide text, the closing line of a block included. */
  from: number
  to: number
  /**
   * `:layout` can show it as its component does: it is the only media of the
   * slide, it holds no content, label or title, and `:layout` takes each of
   * its attributes.
   */
  movable: boolean
}

const MEDIA_GROUPS = new Set(['media', 'storybook'])

/**
 * A media as the walk finds it: how `:layout` shows it, whether its block holds
 * content, whether it carries a label or a title.
 */
type FoundMedia = Omit<BodyMedia, 'movable'> & { spec?: BodyMediaLayoutSpec, content: boolean, captioned: boolean }

/** The attributes of a `{…}` block, by name; an attribute written alone is `true`. */
function writtenAttributes(content = ''): Record<string, string | true> {
  return Object.fromEntries([...blockAttributes(content, 0)].map(attribute => [attribute.name, attribute.value ?? true]))
}

/** Whether the line at `index` stands apart: after a blank line, a heading or the end of a block, and before a blank line. */
function isApart(lines: readonly string[], index: number): boolean {
  const previous = lines[index - 1]
  const next = lines[index + 1]
  const before = previous === undefined || !previous.trim() || ATX_RE.test(previous) || BLOCK_CLOSE_RE.test(previous)
  return before && (next === undefined || !next.trim())
}

/** The media of a slide body, from the text of one slide as `splitSlides` gives it. */
export function bodyMedia(text: string): BodyMedia[] {
  const lines = text.split('\n')
  const found: FoundMedia[] = []
  let block: { media: FoundMedia, open: OpenBlock } | undefined
  // `walk` yields one array of open blocks, which it changes: its length before the line is kept.
  let openBefore = 0
  for (const { index, text: line, code, open } of walk(lines, 0)) {
    const before = openBefore
    openBefore = open.length
    if (block) {
      if (!open.includes(block.open)) {
        found.push({ ...block.media, to: index + 1 })
        block = undefined
      }
      else if (line.trim() && open.length === 1) {
        block.media.content = true
      }
      continue
    }
    // A media of the body starts its line; an image or an inline component also
    // stands apart from the text around it, or it belongs to a paragraph.
    if (code || before || !/^\S/.test(line))
      continue
    const apart = isApart(lines, index)
    const image = apart && MARKDOWN_IMAGE_LINE_RE.exec(line)
    if (image) {
      found.push({ component: 'image', attributes: { src: image[2]!, alt: image[1]!, ...writtenAttributes(image[4]) }, from: index + 1, to: index + 1, spec: MARKDOWN_IMAGE_LAYOUT, content: false, captioned: Boolean(image[3]?.trim()) })
      continue
    }
    const written = COMPONENT_LINE_RE.exec(line)
    const component = written && deckComponentNamed(written[2]!)
    if (!written || !component || !MEDIA_GROUPS.has(component.group ?? '') || (written[1]!.length === 1 && !apart))
      continue
    const media: FoundMedia = { component: component.name, attributes: writtenAttributes(written[4]), from: index + 1, to: index + 1, spec: component.layout, content: false, captioned: Boolean(written[3]) }
    if (written[1]!.length > 1 && open.length === 1)
      block = { media, open: open[0]! }
    else
      found.push(media)
  }
  if (block)
    found.push({ ...block.media, to: lines.length })
  return found.map(({ spec, content, captioned, ...media }) => {
    const names = spec?.attributes
    const taken = Boolean(names) && Object.keys(media.attributes).every(name => name in names!)
    const movable = found.length === 1 && !content && !captioned && taken && !readLayout({ media: 'right', ...bodyMediaLayout(media) }).issues.length
    return { ...media, movable }
  })
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
