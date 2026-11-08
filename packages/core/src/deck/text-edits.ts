import { ATX_RE, BLOCK_CLOSE_RE, BLOCK_OPEN_RE, COMPONENT_LINE_RE, FENCE_RE, LINK_DEFINITION_RE, LIST_MARKER, OTHER_BLOCK_RE, SETEXT_H1_RE, SETEXT_H2_RE, THEMATIC_BREAK_RE } from './scan.ts'

// The starts of the html blocks of types 1 to 6 of CommonMark, which open a
// block in the middle of a paragraph; a line of tags alone (type 7) is in
// OTHER_BLOCK_RE.
const HTML_TYPE6_TAGS = 'address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul'
const HTML_BLOCK_START_RE = new RegExp(`^ {0,3}(?:<(?:script|pre|style|textarea)(?:[\\s>]|$)|<!--|<\\?|<![a-z]|<!\\[CDATA\\[|<\\/?(?:${HTML_TYPE6_TAGS})(?:[\\s/>]|$))`, 'i')

// A footnote definition takes its text out of the paragraph.
const FOOTNOTE_DEFINITION_RE = /^ {0,3}\[\^[^\]]+\]:/
const TABLE_CELL_DELIMITER_RE = /^:?-+:?$/

// The `#` that close an ATX heading, the marker of a list item with the box of
// a task, and the quote marks and the indentation that start a line of a container.
const ATX_CLOSE_RE = /(^|[ \t])(#+)([ \t]*)$/
const LIST_MARK_RE = new RegExp(`^[ \\t]*${LIST_MARKER}(?:[ \\t]+\\[[ x]\\](?=[ \\t]|$))?`, 'i')
const CONTAINER_RE = /^(?:[ \t]*>)*[ \t]*/

/** A replacement of the text from `from` to `to`, offsets in the deck text. */
export interface TextChange {
  from: number
  to: number
  insert: string
}

/** The offset of the start of each line of a text. */
export function lineStarts(text: string): number[] {
  const starts = [0]
  for (let at = text.indexOf('\n'); at !== -1; at = text.indexOf('\n', at + 1))
    starts.push(at + 1)
  return starts
}

/** The range from `from` to `to` of a text without its blank lines at both ends. */
export function contentRange(text: string, from = 0, to = text.length): { from: number, to: number } {
  let start = from
  while (start < to) {
    const newline = text.indexOf('\n', start)
    const lineEnd = newline === -1 ? to : Math.min(newline, to)
    if (text.slice(start, lineEnd).trim())
      break
    start = Math.min(lineEnd + 1, to)
  }
  let end = to
  while (end > start) {
    const lineStart = Math.max(text.lastIndexOf('\n', end - 1) + 1, start)
    if (text.slice(lineStart, end).trim())
      break
    end = Math.max(lineStart - 1, start)
  }
  // The carriage return of a `\r\n` line ending stays out of the range.
  return { from: start, to: end > start && text[end - 1] === '\r' ? end - 1 : end }
}

/** A text with `changes` applied, their offsets in the text before any of them. */
export function applyTextChanges(text: string, changes: readonly TextChange[]): string {
  return [...changes].sort((a, b) => b.from - a.from).reduce((result, { from, to, insert }) => result.slice(0, from) + insert + result.slice(to), text)
}

/**
 * The range of the text of a heading in its source, blanks included: after
 * its `#` marks and before the `#` that close it, or above its setext underline.
 */
export function headingTextRange(source: string): { from: number, to: number, underlined: boolean } | undefined {
  const mark = ATX_RE.exec(source)?.[0]
  if (mark !== undefined) {
    const close = ATX_CLOSE_RE.exec(source.slice(mark.length))
    return { from: mark.length, to: close ? mark.length + close.index + close[1]!.length : source.length, underlined: false }
  }
  const underline = source.lastIndexOf('\n')
  return underline === -1 ? undefined : { from: 0, to: underline, underlined: true }
}

/** A heading text with a backslash before a run of `#` at its end, which would close the heading. */
export function escapeHeadingClose(text: string): string {
  return text.replace(ATX_CLOSE_RE, '$1\\$2$3')
}

/** The offset of the text of a list item in its source: after its marker and the box of a task, before the blanks that follow them. */
export function listItemTextStart(source: string): number {
  return LIST_MARK_RE.exec(source)?.[0].length ?? 0
}

/** The marks of the containers a line sits in: its quote marks and its indentation. */
export function containerPrefix(line: string): string {
  return CONTAINER_RE.exec(line)![0]
}

/**
 * Whether a line, at the start of a line of a paragraph, opens a block: a
 * heading, a thematic break or a setext underline, a code fence, the opening or
 * the closing of an MDC block, a component alone on its line, a quote, a table
 * or its delimiter row, a list item, an html block, or a link or footnote
 * definition.
 */
export function opensBlock(line: string): boolean {
  return [FENCE_RE, BLOCK_OPEN_RE, BLOCK_CLOSE_RE, ATX_RE, THEMATIC_BREAK_RE, SETEXT_H1_RE, SETEXT_H2_RE, OTHER_BLOCK_RE, HTML_BLOCK_START_RE, LINK_DEFINITION_RE, FOOTNOTE_DEFINITION_RE, COMPONENT_LINE_RE]
    .some(re => re.test(line)) || isTableDelimiter(line)
}

// The delimiter row of a table turns the line above it into the table's header;
// a row of one column needs no pipe once it aligns its cell (`-:`).
function isTableDelimiter(line: string): boolean {
  const row = line.trim()
  if (/^ {4}/.test(line))
    return false
  if (!row.includes('|'))
    return row.includes(':') && TABLE_CELL_DELIMITER_RE.test(row)
  return row.replace(/^\||\|$/g, '').split('|').every(cell => TABLE_CELL_DELIMITER_RE.test(cell.trim()))
}

const ASCII_PUNCTUATION_RE = /^[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/

/**
 * A line with a backslash before the mark that opens its block, so that it
 * reads as text: before each leading colon, before the `.` or `)` of a number,
 * otherwise before its first character when it is an ASCII punctuation.
 */
export function escapeBlockStart(line: string): string {
  const indent = /^[ \t]*/.exec(line)![0]
  const rest = line.slice(indent.length)
  const number = /^\d{1,9}(?=[.)])/.exec(rest)?.[0]
  if (number)
    return `${indent}${number}\\${rest.slice(number.length)}`
  const colons = /^:+/.exec(rest)?.[0]
  if (colons)
    return `${indent}${colons.replace(/:/g, '\\:')}${rest.slice(colons.length)}`
  return ASCII_PUNCTUATION_RE.test(rest) ? `${indent}\\${rest}` : line
}
