import type { ParserId } from '@vignettes/core/deck'
import type { Slide } from '../../packages/nuxt/src/runtime/types/presentation.ts'
import { splitSlides } from '@vignettes/core/deck'
import { isSourceAttribute, readSourceRange, SOURCE_ATTRIBUTE, SOURCE_TEXT_ATTRIBUTE } from '@vignettes/core/render'
import { describe, expect, it } from 'vitest'
import { PARSERS } from '../../packages/nuxt/src/runtime/utils/slide-ast.ts'

interface Read {
  tag: string
  source?: string
  text?: string
}

const trees = (slide: Slide) => [slide.pretitle, slide.header, slide.subtitle, slide.body].filter(Boolean) as { children: any[] }[]

/** Every element of every slide, in order, with the source and the text its attributes point at. */
async function reads(raw: string, parser: ParserId): Promise<Read[][]> {
  const slides = await PARSERS[parser].parse(raw, {} as never, { sourcePositions: true })
  const flat = slides.flatMap(slide => slide.verticalSlides ?? [slide])
  const texts = splitSlides(raw, parser).map(source => source.text)
  return flat.map((slide, index) => {
    const found: Read[] = []
    const at = (value: unknown) => {
      const range = readSourceRange(value)
      return range && texts[index]!.slice(range.from, range.to)
    }
    const visit = (node: any) => {
      expect(node.position, 'a position MDC kept').toBeUndefined()
      if (node.type !== 'element')
        return
      found.push({ tag: node.tag, source: at(node.props[SOURCE_ATTRIBUTE]), text: at(node.props[SOURCE_TEXT_ATTRIBUTE]) })
      node.children.forEach(visit)
    }
    trees(slide).forEach(tree => tree.children.forEach(visit))
    return found
  })
}

const textsOf = (found: Read[], tag: string) => found.filter(read => read.tag === tag).map(read => read.text)

describe('source positions of a parsed slide', () => {
  it('leave the slides as they are unless the parser is asked for them', async () => {
    const raw = '# Un **titre**\n\n- un\n- deux\n\n## Suite\n\n<p data-source="0-3">brut</p>'
    for (const parser of ['heading', 'separator'] as const) {
      // Parsed first with the positions, so that a cache keyed on the text alone would hand them on.
      const positioned = await PARSERS[parser].parse(raw, {} as never, { sourcePositions: true })
      const plain = await PARSERS[parser].parse(raw, {} as never)
      expect(JSON.stringify(positioned)).toMatch(/"data-source/)
      expect(JSON.stringify(plain)).not.toMatch(/"position"|"data-source/)
    }
  })

  it('place the elements of a heading deck in the text of their slide', async () => {
    const raw = '---\ntitle: Essai\n---\n\n# Un **titre** ##\n\n## Liste\n\n- un\n- deux\n  - trois\n\n1. quatre\n\n- [ ] tâche\n- [X] faite\n\n### Verticale\n\n\n\nParagraphe\nsur deux lignes.\n'
    const [title, list, vertical] = await reads(raw, 'heading')
    expect(title).toContainEqual({ tag: 'h1', source: '# Un **titre** ##', text: 'Un **titre**' })
    expect(title).toContainEqual({ tag: 'strong', source: '**titre**', text: undefined })
    expect(textsOf(list!, 'li')).toEqual(['un', 'deux', 'trois', 'quatre', 'tâche', 'faite'])
    expect(list!.find(read => read.tag === 'ul')!.source).toBe('- un\n- deux\n  - trois')
    expect(vertical).toContainEqual({ tag: 'p', source: 'Paragraphe\nsur deux lignes.', text: 'Paragraphe\nsur deux lignes.' })
  })

  it('place the elements of a separator deck after the blank lines of their slide', async () => {
    const [, second] = await reads('A\n\n---\n\n\n\nB **gras**\n\n----\n\nC', 'separator')
    expect(second).toContainEqual({ tag: 'p', source: 'B **gras**', text: 'B **gras**' })
  })

  it('read the text of a setext heading without its underline', async () => {
    const [slide] = await reads('Titre\nsouligné\n=====\n\nTexte', 'separator')
    expect(slide).toContainEqual({ tag: 'h1', source: 'Titre\nsouligné\n=====', text: 'Titre\nsouligné' })
  })

  it('keep the hard breaks of a list item and refuse an item of several paragraphs', async () => {
    const [slide] = await reads('- ligne  \n  dure\n- un\\\n  deux\n\nAvant  \naprès\n\n- a\n\n  b', 'separator')
    expect(textsOf(slide!, 'li')).toEqual(['ligne  \n  dure', 'un\\\n  deux', undefined])
    expect(textsOf(slide!, 'p')).toEqual(['Avant  \naprès'])
  })

  it('read the links of the whole deck and the paragraphs inside a component', async () => {
    const raw = '## A\n\n[lien][ref]\n\n::Columns\n:::Column\nÀ gauche\n:::\n::\n\n## B\n\n[ref]: https://exemple.fr'
    const [slide] = await reads(raw, 'heading')
    expect(slide).toContainEqual({ tag: 'a', source: '[lien][ref]', text: undefined })
    expect(textsOf(slide!, 'p')).toContain('À gauche')
    expect(slide!.filter(read => read.tag === 'columns' || read.tag === 'column').every(read => !read.source)).toBe(true)
  })

  it('count the carriage returns of the text', async () => {
    const [slide] = await reads('## Un titre\r\n\r\nUn texte\r\nsur deux lignes\r\n\r\n- b\r\n- c', 'heading')
    expect(slide).toContainEqual({ tag: 'h2', source: '## Un titre', text: 'Un titre' })
    expect(textsOf(slide!, 'p')).toEqual(['Un texte\r\nsur deux lignes'])
    expect(textsOf(slide!, 'li')).toEqual(['b', 'c'])
  })

  it('give no text to a paragraph or a list item that only holds an image', async () => {
    const [slide] = await reads('![Logo](/logo.png)\n\n- ![Logo](/logo.png)\n  - texte', 'separator')
    expect(slide).toContainEqual({ tag: 'p', source: '![Logo](/logo.png)', text: undefined })
    expect(textsOf(slide!, 'li')).toEqual([undefined, 'texte'])
  })

  it('drop the source attributes the author wrote', async () => {
    const slides = await PARSERS.separator.parse('[mot]{data-source="0-1" data-source-text="0-1"}\n\n<p data-source="0-3">brut</p>', {} as never, { sourcePositions: true })
    const props: string[] = []
    const visit = (node: any) => {
      if (node.type !== 'element')
        return
      props.push(...Object.keys(node.props).filter(name => isSourceAttribute(name) && name !== SOURCE_ATTRIBUTE && name !== SOURCE_TEXT_ATTRIBUTE))
      if (node.tag === 'span')
        expect(Object.keys(node.props).some(isSourceAttribute)).toBe(false)
      node.children.forEach(visit)
    }
    slides[0]!.body.children.forEach(visit)
    expect(props).toEqual([])
  })
})
