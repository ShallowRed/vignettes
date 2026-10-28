import type { EditorState, TransactionSpec } from '@codemirror/state'
import type { AttributedDirective, ComponentAttribute } from '@vignettes/core/deck'
import { attributedDirective, attributeNamed, attributeSource, blocksAround, componentAttributeMentions, directiveMentions } from '@vignettes/core/deck'

/**
 * The attributes of the component under the cursor, read from and written to
 * its `{…}` block, for the properties panel of the toolbar. The text stays the
 * one source: a choice in the panel rewrites the block.
 */

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

/** The directive written on the 1-based `line` that declares attributes, the one under `column` first. */
function directiveOn(state: EditorState, line: number, column?: number): ComponentAtCursor | undefined {
  const { text, from } = state.doc.line(line)
  const raw = state.doc.toString()
  const found = directiveMentions(raw).flatMap((mention) => {
    const directive = mention.line === line ? attributedDirective(mention.name) : undefined
    return directive?.attributes ? [{ directive, mention }] : []
  })
  const chosen = found.find(({ mention }) => column !== undefined && column >= mention.column && column <= (mention.attributes?.to ?? mention.column + mention.length)) ?? found[0]
  if (!chosen)
    return undefined
  const { directive, mention } = chosen
  const block = mention.attributes
  const written = componentAttributeMentions(raw)
    .filter(attribute => attribute.line === line && block && attribute.column > block.from && attribute.column < block.to)
    .map(attribute => ({
      name: attribute.name,
      value: attribute.value,
      text: text.slice(attribute.column, attribute.column + attribute.length),
      attribute: attributeNamed(directive, attribute.name),
    }))
  return {
    directive,
    syntax: `${mention.colons}${mention.name}`,
    line,
    nameEnd: from + mention.column + mention.length,
    block: block && { from: from + block.from, to: from + block.to },
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
  return attributeSource(attribute.name, value)
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
