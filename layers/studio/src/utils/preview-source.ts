import type { ChangeDesc } from '@codemirror/state'
import type { ParserId, TextBlock } from '@vignettes/core/deck'
import type { SourceRange } from '@vignettes/core/render'
import { headingTextRange, slideSourceAt } from '@vignettes/core/deck'

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

/** The kind of block of an element, by its tag and its whole source. */
export function textBlock(tag: string, source: string): TextBlock {
  if (/^h[1-6]$/i.test(tag))
    return headingTextRange(source)?.underlined ? 'underlined-heading' : 'heading'
  return tag.toLowerCase() === 'li' ? 'item' : 'paragraph'
}
