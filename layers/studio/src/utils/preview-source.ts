import type { ChangeDesc } from '@codemirror/state'
import type { ParserId, TextChange } from '@vignettes/core/deck'
import type { SourceRange } from '@vignettes/core/render'
import { containerPrefix, escapeBlockStart, escapeHeadingClose, headingTextRange, opensBlock, slideSourceAt, splitSlides, unclosedBlocks } from '@vignettes/core/deck'

/** A slide of the preview, by its Reveal indices. */
export interface SlideIndices {
  h: number
  v: number
}

/**
 * The range in `currentText` of a range of the text of a slide of the preview.
 * The preview draws `renderedText`: the range holds only while the slide has
 * the same text in both, and falls inside it.
 */
export function deckRange(renderedText: string, currentText: string, parser: ParserId, slide: SlideIndices, range: SourceRange): SourceRange | undefined {
  const rendered = slideSourceAt(renderedText, parser, slide.h, slide.v)
  const current = slideSourceAt(currentText, parser, slide.h, slide.v)
  if (!rendered || !current || rendered.text !== current.text || range.to > current.text.length)
    return undefined
  return { from: current.from + range.from, to: current.from + range.to }
}

/** A range of the document moved by `changes`: a text inserted at one of its ends stays out of it. */
export function followRange(range: SourceRange, changes: ChangeDesc): SourceRange {
  return { from: changes.mapPos(range.from, 1), to: changes.mapPos(range.to, -1) }
}

/** The kind of block a text edited on the slide belongs to. */
export type TextBlock = 'heading' | 'underlined-heading' | 'paragraph' | 'item'

/** The kind of block of an element, by its tag and its whole source. */
export function textBlock(tag: string, source: string): TextBlock {
  if (/^h[1-6]$/i.test(tag))
    return headingTextRange(source)?.underlined ? 'underlined-heading' : 'heading'
  return tag.toLowerCase() === 'li' ? 'item' : 'paragraph'
}

/**
 * The text to write in place of `written`, from the text typed on the slide.
 * It keeps the block it is typed in: a heading holds one line; a paragraph or
 * a list item holds no blank line, which keeps its hard breaks. A line that
 * would open a block is escaped, unless it is the line of `written` at the
 * same place; a line after the first keeps the quote marks and the
 * indentation of its line in `written`. The text of a `#` heading opens no
 * block; a run of `#` at its end, which would close it, is escaped.
 */
export function editedText(block: TextBlock, typed: string, written: string): string {
  const text = typed.replaceAll('\r', '').trim()
  if (block === 'heading')
    return escapeHeadingClose(text.replace(/\s*\n\s*/g, ' '))
  const lines = (block === 'underlined-heading' ? text.replace(/\s*\n\s*/g, ' ') : text.replace(/\n(?:[ \t]*\n)+/g, '\n')).split('\n')
  const writtenLines = written.split('\n')
  return lines.map((line, index) => {
    if (line === writtenLines[index])
      return line
    if (index === 0)
      return opensBlock(line) ? escapeBlockStart(line) : line
    const reference = writtenLines[index] ?? (writtenLines.length > 1 ? writtenLines.at(-1)! : '')
    const prefix = containerPrefix(reference)
    const rest = prefix && line.startsWith(prefix) ? line.slice(prefix.length) : line
    return prefix + (opensBlock(rest) ? escapeBlockStart(rest) : rest)
  }).join('\n')
}

/** Whether `after` keeps the slides and the open blocks of `before`. */
export function keepsStructure(before: string, after: string, parser: ParserId): boolean {
  return splitSlides(after, parser).length === splitSlides(before, parser).length
    && unclosedBlocks(after).length === unclosedBlocks(before).length
}

/**
 * The change that writes the text typed on the slide in place of `written`, at
 * `range` of `doc`. Nothing when the text stays the same or is empty;
 * `conflict` when `doc` holds another text than `written` there;
 * `structure` when the change would change the slides or the open blocks of
 * the deck.
 */
export function slideTextChange(doc: string, range: SourceRange, written: string, typed: string, block: TextBlock, parser: ParserId): TextChange | 'conflict' | 'structure' | undefined {
  const insert = editedText(block, typed, written)
  if (!insert || insert === written)
    return undefined
  if (doc.slice(range.from, range.to) !== written)
    return 'conflict'
  if (!keepsStructure(doc, doc.slice(0, range.from) + insert + doc.slice(range.to), parser))
    return 'structure'
  return { from: range.from, to: range.to, insert }
}
