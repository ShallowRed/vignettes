import { frontmatterLineCount } from './frontmatter.ts'

/**
 * The reading of a deck's markdown, line by line, that the modules of the format
 * share: `walk` follows fenced code and the MDC blocks, `scan` classifies each
 * line, `proseLines` blanks the inline code, `blockAttributes` reads a `{…}` block.
 */

export const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/
export const BLOCK_OPEN_RE = /^(\s*)(:{2,})([a-z][\w-]*)/i
export const BLOCK_CLOSE_RE = /^\s*(:{2,})\s*$/
export const ATX_RE = /^ {0,3}(#{1,6})(?:[ \t]|$)/
export const THEMATIC_BREAK_RE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/
export const SETEXT_H1_RE = /^ {0,3}=+[ \t]*$/
export const SETEXT_H2_RE = /^ {0,3}-+[ \t]*$/
// Lines that open a block other than a paragraph, so no setext underline lifts
// them: a quote, a table, a heading, a list item, an html comment, an html
// block tag and a line of html tags alone.
const HTML_BLOCK_TAGS = 'address|article|aside|blockquote|details|div|dl|figure|footer|header|hr|li|main|nav|ol|p|pre|section|table|ul|h[1-6]'
// The marker of a list item: a bullet or a number.
export const LIST_MARKER = '(?:[-*+]|\\d{1,9}[.)])'
export const OTHER_BLOCK_RE = new RegExp(`^ {0,3}(?:[>|]|#{1,6}(?:[ \\t]|$)|${LIST_MARKER}(?:[ \\t]|$)|<!--|<\\/?(?:${HTML_BLOCK_TAGS})(?:[\\s/>]|$)|(?:<\\/?[a-z][\\w-]*(?:\\s[^>]*)?>\\s*)+$)`, 'i')

export const LINK_DEFINITION_RE = /^ {0,3}\[[^\]^][^\]]*\]:\s*\S/
// A line that holds an image alone, with its address, its title and its MDC attributes.
export const MARKDOWN_IMAGE_LINE_RE = /^\s*!\[([^\]]*)\]\(\s*<?([^\s<>)]+)>?([ \t][^)]*)?\)(?:\{([^{}]*)\})?\s*$/
// A line that holds a component alone, with its label and its attributes.
export const COMPONENT_LINE_RE = /^\s*(:+)([a-z][\w-]*)(\[[^\]]*\])?(?:\{([^{}]*)\})?\s*$/i

type Kind = 'blank' | 'nested' | 'text' | 'h1' | 'h2' | 'h3' | 'break'

export interface ScannedLine {
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
  /** The line is the fence that opens fenced code, or the one that closes it. */
  fence?: 'open' | 'close'
  /** The line belongs to fenced code or to an MDC block, its opening and closing lines included. */
  nested: boolean
  /** The blocks still open once the line is read, until the walk reads the next line. */
  open: readonly OpenBlock[]
}

/** Reads the lines from `from` on, following fenced code and the MDC blocks. */
export function* walk(lines: string[], from: number): Generator<WalkedLine> {
  const open: OpenBlock[] = []
  let fence: string | undefined
  for (let index = from; index < lines.length; index++) {
    const text = lines[index]!.replace(/\r$/, '')
    const fenceOpen = fence ? undefined : FENCE_RE.exec(text)
    const close = fence || fenceOpen ? undefined : BLOCK_CLOSE_RE.exec(text)
    const name = fence || fenceOpen || close ? undefined : BLOCK_OPEN_RE.exec(text)
    const code = Boolean(fence || fenceOpen)
    const nested = code || Boolean(name) || open.length > 0
    let edge: WalkedLine['fence']
    if (fence && isFenceClose(text, fence)) {
      fence = undefined
      edge = 'close'
    }
    else if (fenceOpen) {
      fence = fenceOpen[1]
      edge = 'open'
    }
    else if (close && open.length) {
      const at = open.map(block => block.colons.length).lastIndexOf(close[1]!.length)
      if (at !== -1)
        open.length = at
    }
    else if (name) {
      open.push({ name: name[3]!, colons: name[2]!, line: index + 1, column: name[1]!.length, length: name[2]!.length + name[3]!.length })
    }
    yield { index, text, code, ...(edge && { fence: edge }), nested, open }
  }
}

/** Classifies each line after the frontmatter; fenced code and MDC blocks are `nested`. */
export function scan(lines: string[], from: number): ScannedLine[] {
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

const INLINE_CODE_RE = /(`+)[^`]+\1/g

/**
 * The lines of a deck outside the frontmatter and fenced code, with inline code
 * blanked so the columns stay those of the source.
 */
export function* proseLines(raw: string): Generator<{ line: number, prose: string }> {
  for (const { index, text, code } of walk(raw.split('\n'), frontmatterLineCount(raw))) {
    if (!code)
      yield { line: index + 1, prose: text.replace(INLINE_CODE_RE, inline => ' '.repeat(inline.length)) }
  }
}

// A quoted value keeps its backslash escapes, as `\'` in `'"x\'y"'`. An
// attribute written alone has no value.
const ATTRIBUTE_RE = /(^|\s)([:@]?[\w:.-]+)(?:=(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^\s"']+)))?/g

export interface WrittenAttribute {
  name: string
  /** Undefined for an attribute written alone. */
  value?: string
  /** 0-based column in the line, and length of the attribute's text. */
  column: number
  length: number
}

/** The attributes of the `{…}` block whose content starts at `offset` in its line. */
export function* blockAttributes(content: string, offset: number): Generator<WrittenAttribute> {
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

/** Whether a line is a link reference definition (`[label]: address`), which the deck reads apart from the text. */
export function isLinkDefinition(line: string): boolean {
  return LINK_DEFINITION_RE.test(line)
}
