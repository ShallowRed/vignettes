import type { EditorState, TransactionSpec } from '@codemirror/state'
import type { AttributedDirective, ComponentAttribute } from '@vignettes/core/deck'
import { attributedDirective, attributeNamed, blocksAround, componentAttributeMentions } from '@vignettes/core/deck'

/**
 * The attributes of the component under the cursor, read from and written to
 * its `{…}` block, for the properties panel of the toolbar. The text stays the
 * one source: a choice in the panel rewrites the block.
 */

const DIRECTIVE_RE = /(^|[\s([])(:+)([a-z][\w-]*)/gi

export interface ComponentAtCursor {
  directive: AttributedDirective
  /** The name as written, with its colons: `:::Scheme`. */
  syntax: string
  /** 1-based line of the directive. */
  line: number
  /** Positions in the document: the end of the name, and the `{…}` block when it has one. */
  nameEnd: number
  block?: { from: number, to: number }
  /** The attributes written in the block, in their order. */
  written: { name: string, value?: string, text: string, attribute?: ComponentAttribute }[]
}

/** The index of the brace that closes the block opened at `open`, outside the quoted values. */
function blockEnd(text: string, open: number): number {
  let quoted = false
  for (let index = open + 1; index < text.length; index++) {
    if (text[index] === '\\')
      index++
    else if (text[index] === '"')
      quoted = !quoted
    else if (text[index] === '}' && !quoted)
      return index
  }
  return text.length
}

/** The directive written on the 1-based `line` that declares attributes, the one under `column` first. */
function directiveOn(state: EditorState, line: number, column?: number): ComponentAtCursor | undefined {
  const { text, from } = state.doc.line(line)
  const found = [...text.matchAll(DIRECTIVE_RE)].flatMap((match) => {
    const directive = attributedDirective(match[3]!)
    if (!directive?.attributes)
      return []
    const start = match.index + match[1]!.length
    const nameEnd = start + match[2]!.length + match[3]!.length
    const block = text[nameEnd] === '{' ? { from: nameEnd, to: blockEnd(text, nameEnd) + 1 } : undefined
    return [{ directive, start, end: block?.to ?? nameEnd, syntax: `${match[2]}${match[3]}`, nameEnd, block }]
  })
  const chosen = found.find(candidate => column !== undefined && column >= candidate.start && column <= candidate.end) ?? found[0]
  if (!chosen)
    return undefined
  const raw = state.doc.toString()
  const written = componentAttributeMentions(raw)
    .filter(mention => mention.line === line && chosen.block && mention.column > chosen.block.from && mention.column < chosen.block.to)
    .map(mention => ({
      name: mention.name,
      value: mention.value,
      text: text.slice(mention.column, mention.column + mention.length),
      attribute: attributeNamed(chosen.directive, mention.name),
    }))
  return {
    directive: chosen.directive,
    syntax: chosen.syntax,
    line,
    nameEnd: from + chosen.nameEnd,
    block: chosen.block && { from: from + chosen.block.from, to: from + chosen.block.to },
    written,
  }
}

/** The component under the cursor: written on its line, or the innermost block around it. */
export function componentAt(state: EditorState): ComponentAtCursor | undefined {
  const head = state.selection.main.head
  const line = state.doc.lineAt(head)
  const onLine = directiveOn(state, line.number, head - line.from)
  if (onLine)
    return onLine
  const enclosing = blocksAround(state.doc.toString(), line.number)
  for (const block of enclosing.reverse()) {
    const found = directiveOn(state, block.line, block.column)
    if (found)
      return found
  }
  return undefined
}

/** The value the component reads for `attribute`: the written one, or its default. */
export function attributeValue(component: ComponentAtCursor, attribute: ComponentAttribute): string {
  const written = component.written.find(entry => entry.attribute === attribute)
  if (!written)
    return attribute.default ?? ''
  if (attribute.boolean)
    return written.value === undefined || !written.name.startsWith(':') ? 'true' : written.value
  return written.value ?? ''
}

/** The text of an attribute set to `value`, none when the value is the default or empty. */
function attributeText(attribute: ComponentAttribute, value: string): string | undefined {
  if (value === '' || value === (attribute.default ?? (attribute.boolean ? 'false' : undefined)))
    return undefined
  if (attribute.boolean)
    return value === 'true' ? attribute.name : `:${attribute.name}="false"`
  // MDC decodes the entities of an attribute value, and reads no backslash escape.
  return `${attribute.name}="${value.replaceAll('"', '&quot;')}"`
}

/** The change that sets `attribute` of the component under the cursor to `value`. */
export function attributeChange(state: EditorState, attribute: ComponentAttribute, value: string): TransactionSpec {
  const component = componentAt(state)
  if (!component)
    return {}
  const replacement = attributeText(attribute, value)
  const parts = component.written.flatMap(entry => entry.attribute === attribute ? (replacement ? [replacement] : []) : [entry.text])
  if (replacement && !component.written.some(entry => entry.attribute === attribute))
    parts.push(replacement)
  const insert = parts.length ? `{${parts.join(' ')}}` : ''
  const range = component.block ?? { from: component.nameEnd, to: component.nameEnd }
  return { changes: { ...range, insert } }
}
