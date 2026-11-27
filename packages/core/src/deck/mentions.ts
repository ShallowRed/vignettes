import type { ComponentAttribute } from './components.ts'
import type { OpenBlock, WrittenAttribute } from './scan.ts'
import type { SlideRange } from './split.ts'
import { isRefusedEmbed, isValueless, readAttribute } from './attributes.ts'
import { ANNOTATION_TAGS, attributeNamed, componentKey, DECK_ANNOTATIONS, deckComponentNamed, deckComponents } from './components.ts'
import { frontmatterLineCount } from './frontmatter.ts'
import { HTML_TAGS } from './html-tags.ts'
import { LAYOUT_ATTRIBUTES, legacyComponentLayout } from './layout.ts'
import { blockAttributes, LIST_MARKER, proseLines, walk } from './scan.ts'

/**
 * The places where a deck writes its blocks, directives, attributes and values,
 * read from its markdown text for the editor and the deck check, the blocks
 * around a line and the fragment under it, and the declaration of a directive.
 */

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
const ATTRIBUTE_BLOCK_RE = /\{([^{}]*)\}/g

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

/** The component whose items and blocks are fragments. */
const FRAGMENTS_BLOCK = 'Fragments'
const LIST_ITEM_RE = new RegExp(`^\\s*${LIST_MARKER}[ \\t]+`)

interface FragmentCounter {
  /** The name the contract gives the component, or the written name of an unregistered one. */
  name: string
  fragments: boolean
  /** Fragments counted so far, the writing-order index of the next one. */
  count: number
  /** Diagram node ids to their fragment index, for the edges. */
  nodes: Map<string, number>
  /** The column where the text of the last list item starts, while a line indented to it continues that item. */
  itemContent?: number
}

/**
 * The Reveal fragment index under the 1-based `line`, -1 before the first
 * fragment of its slide, so an editor can open the preview at that step.
 * Counted in writing order, or by their `step`: the children the contract
 * declares as fragments of their parent (`DeckComponent.fragment`), and each
 * item or block of a `::Fragments` block, a fenced code block counting as one.
 * A container with `:fragments="false"` counts nothing.
 */
export function fragmentAtLine(raw: string, ranges: SlideRange[], line: number): number {
  let start = ranges[0]?.startLine ?? 1
  for (const range of ranges) {
    if (range.startLine > line)
      break
    start = range.startLine
  }
  const containers = new Set([FRAGMENTS_BLOCK, ...deckComponents().filter(component => component.fragment).map(component => component.parent)])
  const counters = new Map<OpenBlock, FragmentCounter>()
  let index = -1
  // The line above ends a block: a blank line, a line that opens a block or a closing fence.
  let afterBreak = true
  for (const { index: at, text, code, fence, open } of walk(raw.split('\n'), start - 1)) {
    if (at + 1 > line)
      break
    const block = open.at(-1)
    const opens = block?.line === at + 1
    if (block && opens) {
      const component = deckComponentNamed(block.name)
      const name = component?.name ?? block.name
      const attributes = new Map(attributeBlockAt(text, block.column + block.length).written.map(({ name, value }) => [name, value]))
      const outer = open.at(-2)
      const parent = outer && counters.get(outer)
      if (parent?.fragments && component?.fragment && component.parent === parent.name) {
        if (component.fragment === 'link') {
          const ends = [attributes.get('from'), attributes.get('to')]
            .map(id => (id === undefined ? undefined : parent.nodes.get(id)))
            .filter((value): value is number => value !== undefined)
          index = ends.length ? Math.max(...ends) : Math.max(parent.count - 1, 0)
        }
        else {
          const written = attributes.get('step') ?? attributes.get(':step')
          const own = written !== undefined && !Number.isNaN(Number(written)) ? Number(written) : parent.count
          parent.count++
          const id = attributes.get('id')
          if (id)
            parent.nodes.set(id, own)
          index = own
        }
      }
      counters.set(block, { name, fragments: containers.has(name) && attributes.get(':fragments') !== 'false', count: 0, nodes: new Map() })
    }
    else {
      const top = block && counters.get(block)
      // The lines of fenced code belong to the block that its opening fence starts.
      if (top?.name === FRAGMENTS_BLOCK && top.fragments && text.trim() && (!code || fence === 'open')) {
        const item = LIST_ITEM_RE.exec(text)
        // After a blank line, a line indented to the text of the list item above continues that item.
        const continues = !item && top.itemContent !== undefined && text.length - text.trimStart().length >= top.itemContent
        // A fence at the first column starts a block, after a paragraph or a list too.
        if (item || (afterBreak && !continues) || (fence === 'open' && !/^\s/.test(text)))
          index = top.count++
        if (item)
          top.itemContent = item[0].length
        else if (afterBreak && !continues)
          top.itemContent = undefined
      }
    }
    afterBreak = !text.trim() || opens || fence === 'close'
  }
  return index
}

/** A directive as written in the source, with its colons: `::Quote`, `:::Columns`, `:pretitle`. */
export interface DirectiveMention extends ComponentMention {
  colons: string
  /** 0-based columns of its `{…}` block when it has one, the closing brace included; to the end of the line when the block stays open. */
  attributes?: { from: number, to: number }
}

/**
 * The `{…}` block written at the 0-based column `from` of a line, when one opens there: its columns,
 * the closing brace included, or to the end of the line when the block stays open; its attributes;
 * and whether a closing brace or quote is missing.
 */
function attributeBlockAt(text: string, from: number): { attributes?: { from: number, to: number }, written: WrittenAttribute[], malformed: boolean } {
  if (text[from] !== '{')
    return { written: [], malformed: false }
  const close = attributesEnd(text, from + 1)
  const end = typeof close === 'number' ? close : text.length
  return { attributes: { from, to: typeof close === 'number' ? close + 1 : text.length }, written: [...blockAttributes(text.slice(from + 1, end), from + 1)], malformed: typeof close === 'string' }
}

/** The directives written in a deck with the attributes of their `{…}` block, outside the frontmatter, fenced code and inline code. */
function* writtenDirectives(raw: string): Generator<{ mention: DirectiveMention, written: WrittenAttribute[], malformed: boolean }> {
  for (const { line, prose } of proseLines(raw)) {
    for (const match of prose.matchAll(DIRECTIVE_RE)) {
      const [, before, colons, name] = match
      const column = match.index + before!.length
      const length = colons!.length + name!.length
      const { attributes, written, malformed } = attributeBlockAt(prose, column + length)
      yield { mention: { name: name!, colons: colons!, line, column, length, ...(attributes && { attributes }) }, written, malformed }
    }
  }
}

/** The directives written in a deck, outside the frontmatter, fenced code and inline code. */
export function directiveMentions(raw: string): DirectiveMention[] {
  return [...writtenDirectives(raw)].map(({ mention }) => mention)
}

const ANNOTATION_KEYS = new Set(ANNOTATION_TAGS.map(componentKey))

/**
 * Whether the parser takes the annotation of `mention` out of the slide body:
 * it is written alone on `text`, a line outside the blocks, from its first
 * column. Indented, it may continue a list item, which keeps it.
 */
function isLiftedAnnotation(mention: DirectiveMention, text: string | undefined): boolean {
  const end = mention.attributes?.to ?? mention.column + mention.length
  return text !== undefined && mention.column === 0 && ANNOTATION_KEYS.has(componentKey(mention.name)) && !text.slice(end).trim()
}

/**
 * The places where the components named in `names` are written, outside the
 * frontmatter, fenced code and inline code. Names compare as `componentKey`
 * compares them. An annotation the parser takes out of the slide body is left
 * out.
 */
export function componentMentions(raw: string, names: Iterable<string>): ComponentMention[] {
  const wanted = new Set([...names].map(componentKey))
  const topLevel = topLevelLines(raw)
  return directiveMentions(raw)
    .filter(mention => wanted.has(componentKey(mention.name)) && !isLiftedAnnotation(mention, topLevel.get(mention.line)))
    .map(({ name, line, column, length }) => ({ name, line, column, length }))
}

// MDC names an element by the kebab case of the written name: `Strong` and `STRONG` give `strong`, `TBody` gives `t-body`.
const ONE_WORD_RE = /^(?:[a-z][a-z\d]*|[A-Z][a-z\d]*|[A-Z][A-Z\d]*)$/

/**
 * The names of the components a deck writes, once each, as `componentMentions`
 * places them: a directive written in a `{…}` block is an attribute or a value,
 * a directive named after an HTML element renders as that element, and the
 * parser lays its slide out with a component of the earlier format that
 * `legacyComponentLayout` reads.
 */
export function writtenComponentNames(raw: string): string[] {
  const blocks = new Map<number, Array<{ from: number, to: number }>>()
  for (const { line, prose } of proseLines(raw))
    blocks.set(line, [...prose.matchAll(ATTRIBUTE_BLOCK_RE)].map(block => ({ from: block.index, to: block.index + block[0].length })))
  const mentions = directiveMentions(raw)
  for (const { line, attributes } of mentions) {
    if (attributes)
      blocks.get(line)?.push(attributes)
  }
  const topLevel = topLevelLines(raw)
  const names = mentions
    .filter(mention => !blocks.get(mention.line)?.some(({ from, to }) => from < mention.column && mention.column < to))
    .filter(({ name }) => !(ONE_WORD_RE.test(name) && HTML_TAGS.has(name.toLowerCase())) && !legacyComponentLayout(name, {}))
    .filter(mention => !isLiftedAnnotation(mention, topLevel.get(mention.line)))
    .map(({ name }) => name)
  return [...new Set(names)]
}

/** The lines of a deck outside the frontmatter, fenced code and MDC blocks, by their 1-based number. */
function topLevelLines(raw: string): Map<number, string> {
  const topLevel = new Map<number, string>()
  for (const { index, text, nested } of walk(raw.split('\n'), frontmatterLineCount(raw))) {
    if (!nested)
      topLevel.set(index + 1, text)
  }
  return topLevel
}

/** An annotation that the parser takes out of the slide body, with the attributes of its `{…}` block. */
export interface LiftedAnnotation {
  name: string
  /** 1-based line in the whole document. */
  line: number
  /** The written attributes, `true` for one written alone. */
  attributes: Record<string, string | true>
}

/** The annotations that the parser takes out of the slide body, in writing order (see `isLiftedAnnotation`). */
export function liftedAnnotations(raw: string): LiftedAnnotation[] {
  const topLevel = topLevelLines(raw)
  return [...writtenDirectives(raw)]
    .filter(({ mention }) => isLiftedAnnotation(mention, topLevel.get(mention.line)))
    .map(({ mention, written }) => ({
      name: mention.name,
      line: mention.line,
      attributes: Object.fromEntries(written.map(({ name, value }) => [name, value ?? true])),
    }))
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

const BLOCK_TAG_RE = /:+([a-z][\w-]*)(?:\[[^\]]*\])?$/i
// The destination of a markdown link: between angle brackets, spaces included,
// or up to its first space, with one level of balanced parentheses.
const MARKDOWN_LINK_RE = /(!?)\[[^\]]*\]\(\s*(?:<([^<>\n]+)>|<?((?:[^\s()<>]|\([^\s()]*\))+))/g

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
  /** The rank of its `{…}` block in the deck, the same for the values of one block; undefined for the address of a link. */
  block?: number
}

/**
 * The values written in the `{…}` block of a component, an annotation or a
 * span, and the addresses of the inline markdown links and images. Outside
 * the frontmatter, fenced code and inline code.
 */
export function valueMentions(raw: string): ValueMention[] {
  const mentions: ValueMention[] = []
  let rank = 0
  for (const { line, prose } of proseLines(raw)) {
    for (const block of prose.matchAll(ATTRIBUTE_BLOCK_RE)) {
      const before = prose.slice(0, block.index)
      const tag = BLOCK_TAG_RE.exec(before)?.[1] ?? (before.endsWith(')') ? 'a' : 'span')
      for (const { name, value, column, length } of blockAttributes(block[1]!, block.index + 1)) {
        if (value !== undefined)
          mentions.push({ tag, name, value, line, column, length, block: rank })
      }
      rank++
    }
    for (const link of prose.matchAll(MARKDOWN_LINK_RE)) {
      const [text, bang, bracketed, bare] = link
      const url = bracketed ?? bare!
      const image = bang === '!'
      const end = link.index + text.length - (bracketed === undefined ? 0 : 1)
      mentions.push({ tag: image ? 'img' : 'a', name: image ? 'src' : 'href', value: url, line, column: end - url.length, length: url.length })
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
  return [...writtenDirectives(raw)].flatMap(({ mention, written }) => written.map(attribute => ({ tag: mention.name, line: mention.line, ...attribute })))
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

/**
 * An attribute that its component leaves unused: a name it does not declare
 * (`unknown`), `"false"` written to a `true`/`false` attribute without the
 * colon (`false-text`), which the component reads as a text, so as true, or a
 * text attribute that holds no text (`no-value`, see `isValueless`). Or an
 * attribute the component needs and the block leaves out (`missing`), placed
 * on the directive.
 */
export interface ComponentAttributeIssue {
  kind: 'unknown' | 'false-text' | 'no-value' | 'missing'
  /** The component, by its declared name. */
  component: string
  /** The attribute as written, or as declared when it is missing. */
  name: string
  line: number
  column: number
  length: number
}

/**
 * The attributes of the components of a deck that the component leaves unused,
 * and those it needs and the deck leaves out, for the components that declare
 * their attributes. `layoutMentions` reports those of `:layout`, which
 * `readLayout` reads.
 */
export function componentAttributeIssues(raw: string): ComponentAttributeIssue[] {
  const issues: ComponentAttributeIssue[] = []
  for (const { mention: directive, written, malformed } of writtenDirectives(raw)) {
    const component = directive.name === 'layout' ? undefined : attributedDirective(directive.name)
    if (!component?.attributes)
      continue
    const place = { component: component.name, line: directive.line }
    for (const mention of written) {
      const attribute = attributeNamed(component, mention.name)
      if (!attribute && (PASSTHROUGH_ATTRIBUTE_RE.test(mention.name) || /^(?:v-|@)/.test(mention.name)))
        continue
      // MDC gives an attribute written alone as `true`.
      const reading = mention.value === undefined ? { name: mention.name, value: true } : readAttribute(directive.name, mention.name, mention.value)
      const kind = !attribute
        ? 'unknown'
        : attribute.boolean && !mention.name.startsWith(':') && mention.value === 'false'
          ? 'false-text'
          : !malformed && 'name' in reading && isValueless(directive.name, reading.name, reading.value) ? 'no-value' : undefined
      if (kind)
        issues.push({ kind, ...place, name: mention.name, column: mention.column, length: mention.length })
    }
    for (const attribute of malformed ? [] : component.attributes) {
      if (attribute.required && !written.some(({ name }) => attributeNamed(component, name) === attribute))
        issues.push({ kind: 'missing', ...place, name: attribute.name, column: directive.column, length: directive.length })
    }
  }
  return issues
}
