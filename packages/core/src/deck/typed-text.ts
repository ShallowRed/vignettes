import type { ParserId } from './parser.ts'
import type { TextChange } from './text-edits.ts'
import { unclosedBlocks } from './mentions.ts'
import { splitSlides } from './split.ts'
import { containerPrefix, escapeBlockStart, escapeHeadingClose, opensBlock } from './text-edits.ts'

/**
 * A text typed outside the source, on a slide of the preview or in the
 * outline of the editor, written into the deck in place of the text it
 * stands for, in the same block.
 */

/** The kind of block a typed text belongs to. */
export type TextBlock = 'heading' | 'underlined-heading' | 'paragraph' | 'item'

/**
 * The text to write in place of `written`, from the text typed. It keeps the
 * block it is typed in: a heading holds one line; a paragraph or a list item
 * holds no blank line, which keeps its hard breaks. A line that would open a
 * block is escaped, unless it is the line of `written` at the same place; a
 * line after the first keeps the quote marks and the indentation of its line
 * in `written`. The text of a `#` heading opens no block; a run of `#` at its
 * end, which would close it, is escaped.
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

/** Why the deck refuses a typed text: it changed meanwhile, or the text would change its slides or its open blocks. */
export type TextRefusal = 'conflict' | 'structure'

/**
 * The change that writes the text typed in place of `written`, at `range` of
 * `doc`. Nothing when the text stays the same or is empty;
 * `conflict` when `doc` holds another text than `written` there;
 * `structure` when the change would change the slides or the open blocks of
 * the deck.
 */
export function typedTextChange(doc: string, range: { from: number, to: number }, written: string, typed: string, block: TextBlock, parser: ParserId): TextChange | TextRefusal | undefined {
  const insert = editedText(block, typed, written)
  if (!insert || insert === written)
    return undefined
  if (doc.slice(range.from, range.to) !== written)
    return 'conflict'
  if (!keepsStructure(doc, doc.slice(0, range.from) + insert + doc.slice(range.to), parser))
    return 'structure'
  return { from: range.from, to: range.to, insert }
}
