import type { Extension } from '@codemirror/state'
import type { Translate } from '../config/editor-reference'
import type { ReferenceCard } from './editor-tooltip'
import { hoverTooltip } from '@codemirror/view'
import { directiveMentions, layoutAnnotations } from '@vignettes/core/deck'
import { directiveEntry, DOCS_SECTIONS, layoutAttributeEntries } from '../config/editor-reference'
import { referenceCard } from './editor-tooltip'

/**
 * The tooltip under the pointer in the slide body: the name, the description
 * and the documentation of a component or an annotation, and of an attribute
 * of `:layout`. The frontmatter guide has its own tooltip.
 */

export interface HoverOptions {
  /** Interface language of the texts. */
  lang: string
  t: Translate
  /** The address of a documentation section, none when the instance has no documentation. */
  docsUrl: (docs?: string) => string | undefined
}

/** A card and the columns of its line it describes, 0-based. */
export interface LineReference {
  from: number
  to: number
  card: ReferenceCard
}

type ReferenceOptions = Pick<HoverOptions, 'lang' | 'docsUrl'>

/**
 * What the tooltip describes at `column` of the 1-based `line` of a deck: an
 * attribute of `:layout`, or the name of a component or an annotation, as the
 * deck core reads them.
 */
export function referenceAt(raw: string, line: number, column: number, options: ReferenceOptions): LineReference | null {
  const attribute = layoutAnnotations(raw)
    .filter(annotation => annotation.line === line)
    .flatMap(annotation => annotation.attributes)
    .find(written => column >= written.column && column <= written.column + written.name.length)
  if (attribute) {
    const entry = layoutAttributeEntries(options.lang).find(candidate => candidate.name === attribute.name)
    return entry
      ? { from: attribute.column, to: attribute.column + attribute.name.length, card: { syntax: entry.name, description: entry.description, values: entry.values, docs: options.docsUrl(DOCS_SECTIONS.layout) } }
      : null
  }
  const directive = directiveMentions(raw).find(mention => mention.line === line && column >= mention.column && column <= mention.column + mention.length)
  const entry = directive && directiveEntry(directive.colons, directive.name, options.lang)
  return entry
    ? { from: directive.column, to: directive.column + directive.length, card: { syntax: entry.syntax, label: entry.label, description: entry.description, docs: options.docsUrl(entry.docs) } }
    : null
}

export function deckHover(options: HoverOptions): Extension {
  return hoverTooltip((view, pos) => {
    const line = view.state.doc.lineAt(pos)
    const reference = referenceAt(view.state.doc.toString(), line.number, pos - line.from, options)
    return reference
      ? { pos: line.from + reference.from, end: line.from + reference.to, above: true, create: () => ({ dom: referenceCard(reference.card, options.t) }) }
      : null
  })
}
