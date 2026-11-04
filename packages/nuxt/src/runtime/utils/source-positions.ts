import type { MDCElement, MDCNode } from '@nuxtjs/mdc'
import { headingTextRange, listItemTextStart } from '@vignettes/core/deck'
import { isSourceAttribute, SOURCE_ATTRIBUTE, SOURCE_TEXT_ATTRIBUTE, sourceRangeValue, TEXT_END_TAGS } from '@vignettes/core/render'

/** The offsets MDC keeps on a node with `keepPosition`, in the text it parsed with its `\r\n` read as `\n`. */
interface Position {
  start: number
  end: number
}

type Positioned = MDCNode & { position?: Position }

// The elements that carry the range of their source. A component of the deck
// carries none: Vue passes an attribute on to the root of a component, and
// warns when the component has several roots.
const SOURCE_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'table', 'tr', 'th', 'td', 'a', 'strong', 'em', 'del', 'img'])
const HEADING_RE = /^h[1-6]$/
const BLANK_LINE_RE = /\n[ \t]*\n/

function hasText(node: MDCNode): boolean {
  if (node.type === 'text')
    return node.value.trim() !== ''
  return node.type === 'element' && node.children.some(hasText)
}

/** The range of `text` within `range`, without the blanks at its ends. */
function trimmed(text: string, range: Position): Position | undefined {
  const content = text.slice(range.start, range.end)
  const start = range.start + content.length - content.trimStart().length
  const end = range.end - (content.length - content.trimEnd().length)
  return start < end ? { start, end } : undefined
}

/**
 * The range of the text of a heading, a paragraph or a list item, in the text
 * MDC parsed: a paragraph whole; a heading without its `#` marks or its setext
 * underline; a list item after its marker and the box of a task, up to its
 * first block child. A list item whose text holds a blank line has several
 * paragraphs, which MDC flattens, and gets none.
 */
function textRange(element: MDCElement, position: Position, text: string): Position | undefined {
  const source = text.slice(position.start, position.end)
  if (element.tag === 'p')
    return hasText(element) ? trimmed(text, position) : undefined
  if (HEADING_RE.test(element.tag)) {
    const heading = hasText(element) ? headingTextRange(source) : undefined
    return heading && trimmed(text, { start: position.start + heading.from, end: position.start + heading.to })
  }
  if (element.tag !== 'li')
    return undefined
  const children = element.children as Positioned[]
  const blockAt = children.findIndex(child => child.type === 'element' && TEXT_END_TAGS.has(child.tag))
  if (!children.slice(0, blockAt === -1 ? undefined : blockAt).some(hasText))
    return undefined
  const block = children[blockAt]
  const range = trimmed(text, { start: position.start + listItemTextStart(source), end: block?.position?.start ?? position.end })
  return range && !BLANK_LINE_RE.test(text.slice(range.start, range.end)) ? range : undefined
}

/**
 * Writes on each element of `SOURCE_TAGS` the range of the slide source it
 * comes from (`SOURCE_ATTRIBUTE`), and on a heading, a paragraph and a list
 * item the range of its text (`SOURCE_TEXT_ATTRIBUTE`). `parsed` is the text
 * MDC parsed, and `shift` turns an offset of `parsed` into an offset of the
 * slide text. The positions MDC kept leave the nodes, and so does a source
 * attribute the author wrote.
 */
export function writeSourcePositions(nodes: MDCNode[], parsed: string, shift: number): MDCNode[] {
  const text = parsed.replaceAll('\r\n', '\n')
  // MDC reads `\r\n` as `\n`: an offset of `text` moves past the `\r` it dropped before it.
  const returns: number[] = []
  for (let at = parsed.indexOf('\r\n'); at !== -1; at = parsed.indexOf('\r\n', at + 2))
    returns.push(at - returns.length)
  const toSlide = (offset: number) => offset + returns.filter(at => at < offset).length + shift
  const range = ({ start, end }: Position) => sourceRangeValue({ from: toSlide(start), to: toSlide(end) })

  function visit(node: Positioned): MDCNode {
    const { position, ...rest } = node
    if (rest.type !== 'element')
      return rest as MDCNode
    const props = Object.fromEntries(Object.entries(rest.props ?? {}).filter(([name]) => !isSourceAttribute(name)))
    if (position && SOURCE_TAGS.has(rest.tag)) {
      props[SOURCE_ATTRIBUTE] = range(position)
      const inner = textRange(rest, position, text)
      if (inner)
        props[SOURCE_TEXT_ATTRIBUTE] = range(inner)
    }
    return { ...rest, props, children: rest.children.map(visit) }
  }

  return nodes.map(visit)
}
