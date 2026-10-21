import type { MDCElement, MDCNode, MDCRoot } from '@nuxtjs/mdc'
import { isDeckUrl, urlKindOf } from '@vignettes/core/deck'
import { describe, expect, it } from 'vitest'
import { headingParser } from '../../packages/nuxt/src/runtime/utils/slide-ast.ts'
import { keepKnownComponents, knownComponentNames } from '../../packages/nuxt/src/runtime/utils/slide-rendering.ts'

// A deck that tries every way of placing a script in the studio page, as the
// author of a deck can write it.
const HOSTILE = `# Titre

:layout{name="media-right" :src="storybook"}

::Iframe{src="javascript:alert(1)"}
::

::Iframe{:src="storybook"}
::

::Iframe{:src='"javascript:alert(2)"'}
::

::Iframe{src="data:application/xhtml+xml,<x/>"}
::

::StoryFrame{src="vbscript:msgbox(1)"}
::

[link](javascript:alert(3)) [bound]{:href="storybook"} [object]{v-bind="reveal"}

<a data-preview-link="javascript:alert(4)" href="//evil.example">brut</a>

<iframe src="https://evil.example"></iframe>

<meta http-equiv="refresh" content="0;url=https://evil.example">

<style>@import url(https://evil.example/a.css);</style>

<form action="https://evil.example"><button>Envoyer</button></form>

<svg><a :href="storybook"><text>svg</text></a></svg>

{{ $route.matched.0.instances.default.$el.ownerDocument.defaultView.alert }} {{ title }}

:quicklink{text="Retour" href="javascript:alert(5)"}

:slide-background{image="javascript:alert(6)"}
`

function elements(nodes: MDCNode[]): MDCElement[] {
  return nodes.flatMap(node => node.type === 'element' ? [node, ...elements(node.children)] : [])
}

describe('a hostile deck', async () => {
  const [slide] = await headingParser.parse(HOSTILE)
  const found = elements(slide!.body.children)

  it('gives no address outside the rule', () => {
    for (const element of found) {
      for (const [name, value] of Object.entries(element.props ?? {})) {
        if (urlKindOf(element.tag, name))
          expect(isDeckUrl(value, urlKindOf(element.tag, name)), `${element.tag} ${name}=${value}`).toBe(true)
      }
    }
    expect(slide!.quicklink).toBeUndefined()
    expect(slide!.backgroundImage).toBeUndefined()
  })

  it('keeps no bound attribute and no directive', () => {
    const names = found.flatMap(element => Object.keys(element.props ?? {}))
    expect(names.filter(name => /^(?::|v-bind|v-on|@|v-model)/.test(name))).toEqual([])
  })

  it('keeps no meta, style or form element, and draws a raw iframe with the Iframe component', () => {
    const tags = found.map(element => element.tag)
    for (const tag of ['meta', 'style', 'form', 'button'])
      expect(tags).not.toContain(tag)
    const frames = found.filter(element => element.tag === 'iframe').map(element => element.props)
    expect(frames).toContainEqual({ src: 'https://evil.example' })
    expect(frames.filter(props => props && 'src' in props && !String(props.src).startsWith('https://'))).toEqual([])
  })

  it('keeps a binding that reads the deck data, and drops one that reaches the page', () => {
    const bindings = found.filter(element => element.tag === 'binding').map(element => element.props?.value)
    expect(bindings).toEqual(['title'])
  })

  it('stays safe when the renderer receives a tree the parser did not filter', () => {
    const tree: MDCRoot = {
      type: 'root',
      children: [
        { type: 'element', tag: 'iframe', props: { ':src': 'storybook', '__ignoreMap': '' }, children: [] },
        { type: 'element', tag: 'a', props: { 'href': '#', 'v-bind': 'reveal' }, children: [] },
        { type: 'element', tag: 'binding', props: { value: '$doc.$route.fullPath' }, children: [] },
      ],
    }
    expect(keepKnownComponents(tree, knownComponentNames()).children).toEqual([
      { type: 'element', tag: 'iframe', props: {}, children: [] },
      { type: 'element', tag: 'a', props: { href: '#' }, children: [] },
      { type: 'text', value: '' },
    ])
  })
})

describe('a legitimate deck', () => {
  it('keeps its bound literals and its addresses', async () => {
    const [slide] = await headingParser.parse([
      '# Titre',
      ':::Scheme{:fragments="false"}',
      '::Step{n="1" :step="2"}',
      '::',
      ':::',
      '::Image{src="data:image/png;base64,iVBORw0KGgo=" :preview="true"}',
      '::',
      '[docs](https://example.com) ![a](/a.png)',
    ].join('\n'))
    const found = elements(slide!.body.children)
    expect(found.find(element => element.tag === 'scheme')?.props).toEqual({ fragments: false })
    expect(found.find(element => element.tag === 'step')?.props).toEqual({ n: '1', step: 2 })
    expect(found.find(element => element.tag === 'deck-image')?.props).toEqual({ src: 'data:image/png;base64,iVBORw0KGgo=', preview: true })
    expect(found.find(element => element.tag === 'a')?.props?.href).toBe('https://example.com')
    expect(found.find(element => element.tag === 'img')?.props?.src).toBe('/a.png')
  })
})
