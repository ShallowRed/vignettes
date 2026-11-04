import { attributeKey } from '../deck/attributes.ts'

/**
 * The range of the source an element of the editor's preview comes from, in
 * the text of its slide as `splitSlides` cuts it. The render module writes it
 * on the elements of a slide when the parser is asked for it (`sourcePositions`
 * of `ParseOptions`), and the editor reads it back.
 */
export interface SourceRange {
  from: number
  to: number
}

/** The range of the whole source of an element. */
export const SOURCE_ATTRIBUTE = 'data-source'

/** The range of the text of a heading, a paragraph or a list item, without its markers and its nested blocks. */
export const SOURCE_TEXT_ATTRIBUTE = 'data-source-text'

/** The children of a list item that end its text, which the source text range leaves out. */
export const TEXT_END_TAGS: ReadonlySet<string> = new Set(['ul', 'ol', 'p', 'pre', 'blockquote', 'table', 'div', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'])

/** The element that draws the box of a task, before the text of its list item. */
export const TASK_BOX_TAG = 'input'

const SOURCE_KEYS = new Set([SOURCE_ATTRIBUTE, SOURCE_TEXT_ATTRIBUTE].map(attributeKey))
const RANGE_RE = /^(\d+)-(\d+)$/

/** The value of a source attribute: `from-to`. */
export function sourceRangeValue(range: SourceRange): string {
  return `${range.from}-${range.to}`
}

/** The range a source attribute holds, or `undefined` for any other value. */
export function readSourceRange(value: unknown): SourceRange | undefined {
  const match = typeof value === 'string' ? RANGE_RE.exec(value) : null
  if (!match)
    return undefined
  const from = Number(match[1])
  const to = Number(match[2])
  return Number.isSafeInteger(to) && from <= to ? { from, to } : undefined
}

/** Whether an attribute is one of the two source attributes, in any spelling MDC gives it (`data-source`, `dataSource`). */
export function isSourceAttribute(name: string): boolean {
  return SOURCE_KEYS.has(attributeKey(name))
}
