import { splitSlides } from '@vignettes/core/deck'
import { describe, expect, it } from 'vitest'
import { PARSERS } from '../../packages/nuxt/src/runtime/utils/slide-ast.ts'

function positions(raw: string, parser: 'heading' | 'separator') {
  return splitSlides(raw, parser).map(({ startLine, h, v }) => `${startLine}:${h}.${v}`)
}

describe('splitSlides, heading decks', () => {
  it('keeps a thematic break inside the title slide', () => {
    expect(positions('# T\n\ntext\n\n---\n\nmore\n\n## A\n\nx', 'heading')).toEqual(['1:0.0', '9:1.0'])
  })

  it('opens a slide on a thematic break outside the title slide, spaced ones included', () => {
    expect(positions('## A\n\na\n\n* * *\n\nb\n\n___\n\nc', 'heading')).toEqual(['1:0.0', '5:1.0', '9:2.0'])
  })

  it('reads fenced code and MDC blocks as content', () => {
    expect(positions('## A\n\n```\n## not\n---\n```\n\n## B', 'heading')).toEqual(['1:0.0', '8:1.0'])
    expect(positions('::FullScreenImage{src="/bg.png"}\n# Title\n::\n\n## Next', 'heading')).toEqual(['1:0.0', '5:1.0'])
    expect(positions(':::Screens\n::StoryFrame{story="x"}\n::\n## inside\n:::\n\n## B', 'heading')).toEqual(['1:0.0', '7:1.0'])
  })

  it('lifts the paragraph of a setext heading', () => {
    expect(positions('## A\n\ntext\n\nPara\n---\n\nafter', 'heading')).toEqual(['1:0.0', '5:1.0'])
    expect(positions('Para\n---\n\ntext', 'heading')).toEqual(['1:0.0'])
  })

  it('stacks a `###` unless it opens its section', () => {
    expect(positions('## A\n\n### v1\n\ntext\n\n### v2\n\n## B\n\n### only', 'heading'))
      .toEqual(['1:0.0', '3:0.1', '7:0.2', '9:1.0', '11:1.1'])
  })

  it('starts after the frontmatter and returns nothing for an empty deck', () => {
    expect(positions('---\ntitle: x\n---\n\n# T\n\n## A', 'heading')).toEqual(['5:0.0', '7:1.0'])
    expect(splitSlides('', 'heading')).toEqual([])
  })
})

describe('splitSlides, separator decks', () => {
  it('splits on `---` and stacks on `----`, outside fenced code', () => {
    expect(positions('a\n---\nb\n----\nc\n---\n```\n---\n```\nd', 'separator')).toEqual(['1:0.0', '3:1.0', '5:1.1', '7:2.0'])
  })

  it('keeps the separators out of the slides', () => {
    expect(splitSlides('a\n---\nb', 'separator').map(s => s.text)).toEqual(['a', 'b'])
  })
})

describe('parsed slides', () => {
  it('keeps a thematic break and the fenced code of the slide it opens', async () => {
    const [, slide] = await PARSERS.heading.parse('## A\n\ntext\n\n---\n\n```\na\n---\n```', {} as any)
    const children = (slide!.body as any).children
    expect(children.map((node: any) => node.tag)).toEqual(['hr', 'pre'])
    expect(children[1].props.code).toBe('a\n---\n')
  })

  it('resolves a link reference defined on another slide of a heading deck', async () => {
    const [slide] = await PARSERS.heading.parse('## A\n\n[x][ref]\n\n## B\n\n[ref]: https://e.x', {} as any)
    const link = (slide!.body as any).children[0].children[0]
    expect(link.tag).toBe('a')
    expect(link.props.href).toBe('https://e.x')
  })

  it('keeps fenced code whole in a separator deck', async () => {
    const slides = await PARSERS.separator.parse('a\n---\n```\nb\n---\nc\n```', {} as any)
    expect(slides).toHaveLength(2)
    expect((slides[1]!.body as any).children[0].props.code).toBe('b\n---\nc\n')
  })
})
