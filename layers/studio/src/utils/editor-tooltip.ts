import type { Translate } from '../config/editor-reference'

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

/** A description cut into its text and its `code` spans, which the descriptions write between backticks. */
export function codeParts(text: string): { text: string, code: boolean }[] {
  return text.split('`').map((part, index) => ({ text: part, code: index % 2 === 1 })).filter(part => part.text)
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
  if (card.description) {
    const text = document.createElement('p')
    for (const part of codeParts(card.description)) {
      const node = document.createElement(part.code ? 'code' : 'span')
      node.textContent = part.text
      text.append(node)
    }
    dom.append(text)
  }
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
