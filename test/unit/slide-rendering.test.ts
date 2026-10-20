import type { MDCElement, MDCNode, MDCRoot } from '@nuxtjs/mdc'
import { describe, expect, it } from 'vitest'
import { keepKnownComponents, unknownComponents } from '../../packages/nuxt/src/runtime/utils/slide-rendering.ts'

function el(tag: string, children: MDCNode[] = [], props: Record<string, unknown> = {}): MDCElement {
  return { type: 'element', tag, props, children }
}
const text = (value: string): MDCNode => ({ type: 'text', value })
const root = (...children: MDCNode[]): MDCRoot => ({ type: 'root', children })

describe('keepKnownComponents', () => {
  it('keeps a registered component, whatever the case and hyphens of its name', () => {
    const tree = root(el('quote', [text('a')], { author: 'b' }), el('two-columns', [text('c')]))
    expect(keepKnownComponents(tree, ['Quote', 'TwoColumns'])).toEqual(tree)
  })

  it('replaces an unknown component with a block holding its content', () => {
    const tree = root(el('tabs', [el('h3', [text('JS')]), el('pre', [text('code')])], { active: '1' }))
    expect(keepKnownComponents(tree, ['Quote'])).toEqual(
      root(el('div', [el('h3', [text('JS')]), el('pre', [text('code')])])),
    )
  })

  it('keeps an unknown inline component inline', () => {
    const tree = root(el('p', [text('a '), el('badge', [text('b')])]))
    expect(keepKnownComponents(tree, [])).toEqual(root(el('p', [text('a '), el('span', [text('b')])])))
  })

  it('turns the named slots of an unknown component into its content', () => {
    const tree = root(el('callout', [el('template', [el('p', [text('title')])], { 'v-slot:title': '' }), el('p', [text('body')])]))
    expect(keepKnownComponents(tree, [])).toEqual(root(el('div', [el('p', [text('title')]), el('p', [text('body')])])))
  })

  it('keeps html elements and the inside of an svg', () => {
    const tree = root(el('svg', [el('path', [], { d: 'M0 0' })]), el('table', [el('tr', [el('td', [text('1')])])]))
    expect(keepKnownComponents(tree, [])).toEqual(tree)
  })
})

describe('unknownComponents', () => {
  it('names once each component that keepKnownComponents replaces', () => {
    const tree = root(el('quote', [el('callout', [text('a')])]), el('p', [el('badge', [text('b')]), el('callout', [])]), el('svg', [el('path', [])]))
    expect(unknownComponents(tree, ['Quote'])).toEqual(['callout', 'badge'])
  })
})
