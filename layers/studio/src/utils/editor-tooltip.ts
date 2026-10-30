import type { Translate } from '../config/editor-reference'
import { codeParts } from './code-parts'

/**
 * The content of the editor's tooltips: a component, an annotation, an
 * attribute or a frontmatter key, with the link to its documentation.
 */

export interface ReferenceCard {
  /** The syntax, written as code: `::Quote`, `media`. */
  syntax: string
  /** The name in the interface, before the syntax. */
  label?: string
  description?: string
  values?: readonly string[]
  /** The value an attribute takes when it is absent. */
  default?: string
  /** The attributes of a component. */
  attributes?: readonly string[]
  /** Address of its documentation section. */
  docs?: string
}

/** A paragraph of `text`, its spans between backticks shown as code. */
export function codeParagraph(text: string, className = ''): HTMLParagraphElement {
  const paragraph = document.createElement('p')
  paragraph.className = className
  for (const part of codeParts(text)) {
    const node = document.createElement(part.code ? 'code' : 'span')
    node.textContent = part.text
    paragraph.append(node)
  }
  return paragraph
}

/** The link to a documentation section, opened in another tab. */
export function docsLink(href: string, label: string): HTMLElement {
  const link = document.createElement('a')
  link.className = 'cm-source-tooltip__link'
  link.href = href
  link.target = '_blank'
  link.rel = 'noopener'
  link.textContent = label
  return link
}

/** The content of a reference tooltip, also shown beside a completion. */
export function referenceCard(card: ReferenceCard, t: Translate): HTMLElement {
  const dom = document.createElement('div')
  dom.className = 'cm-source-tooltip'
  const heading = document.createElement('p')
  if (card.label) {
    const label = document.createElement('strong')
    label.className = 'cm-source-tooltip__label'
    label.textContent = card.label
    heading.append(label, ' ')
  }
  const syntax = document.createElement('code')
  syntax.className = 'cm-source-tooltip__key'
  syntax.textContent = card.syntax
  heading.append(syntax)
  dom.append(heading)
  if (card.description)
    dom.append(codeParagraph(card.description))
  if (card.values?.length) {
    const values = document.createElement('p')
    values.className = 'cm-source-tooltip__values'
    values.textContent = card.values.join(' · ')
    dom.append(values)
  }
  if (card.default !== undefined) {
    const fallback = document.createElement('p')
    fallback.className = 'cm-source-tooltip__values'
    fallback.textContent = t('editor.attributeDefault', { value: card.default })
    dom.append(fallback)
  }
  if (card.attributes?.length) {
    const attributes = document.createElement('p')
    attributes.className = 'cm-source-tooltip__values'
    attributes.textContent = t('editor.componentAttributes', { names: card.attributes.join(' · ') })
    dom.append(attributes)
  }
  if (card.docs)
    dom.append(docsLink(card.docs, t('editor.docsLink')))
  return dom
}
