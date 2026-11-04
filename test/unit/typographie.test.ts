import { DomTextTransformer, transformerTexte } from '@vignettes/typographie'
import { describe, expect, it } from 'vitest'

// Nodes with the members the transformer reads: Vitest runs without a DOM.
function element(tagName: string, children: any[], isContentEditable = false): any {
  const node: any = { nodeType: 1, tagName, isContentEditable, parentElement: null }
  node.childNodes = children
  for (const child of children)
    child.parentElement = node
  return node
}

const text = (textContent: string): any => ({ nodeType: 3, textContent, parentElement: null })

const transformer = new DomTextTransformer({ transform: transformerTexte })

describe('the French typography of a page', () => {
  it('sets the French spaces of a text', () => {
    const typed = text('Bilan: fin')
    transformer.processNode(element('p', [typed]))
    expect(typed.textContent).not.toBe('Bilan: fin')
  })

  it('leaves the text of an editable element as typed, on the first pass and in its mutations', () => {
    const typed = text('Bilan: fin')
    const field = element('span', [typed], true)
    transformer.processNode(element('p', [field]))
    expect(typed.textContent).toBe('Bilan: fin')

    const added = text('Oui?')
    field.childNodes.push(added)
    added.parentElement = { isContentEditable: true }
    transformer.processMutation({ type: 'childList', target: field, addedNodes: [added] as any })
    transformer.processMutation({ type: 'characterData', target: typed, addedNodes: [] as any })
    expect(added.textContent).toBe('Oui?')
    expect(typed.textContent).toBe('Bilan: fin')
  })

  it('transforms a text changed outside an editable element', () => {
    const changed = text('Oui?')
    element('p', [changed])
    transformer.processMutation({ type: 'characterData', target: changed, addedNodes: [] as any })
    expect(changed.textContent).not.toBe('Oui?')
  })
})
