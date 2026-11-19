import type { Slide } from '../../packages/nuxt/src/runtime/types/presentation.ts'
import { describe, expect, it } from 'vitest'
import { headingParser } from '../../packages/nuxt/src/runtime/utils/slide-ast.ts'
import { getSlideClasses, slideKeys } from '../../packages/nuxt/src/runtime/utils/slide-rendering.ts'

async function bodyOf(raw: string) {
  const [slide] = await headingParser.parse(raw)
  return slide!.body.children
}

describe('image components', () => {
  it('keeps ::Image a component with its slot', async () => {
    const [node] = await bodyOf('::Image{src="/a.svg" alt="A"}\nA caption\n::')
    expect(node.tag).toBe('deck-image')
    expect(node.props).toEqual({ alt: 'A', src: '/a.svg' })
    expect(node.children[0].children[0].value).toBe('A caption')
  })

  it('keeps an inline :Image a component', async () => {
    const [paragraph] = await bodyOf('Text :Image{src="/a.svg"}')
    expect(paragraph.children[1].tag).toBe('deck-image')
  })

  it('leaves a markdown image a native img', async () => {
    const [paragraph] = await bodyOf('![A](/a.png)')
    expect(paragraph.children[0].tag).toBe('img')
  })
})

describe('full screen image of the earlier format', () => {
  it('lays its image behind the text, with its veil', async () => {
    const [slide] = await headingParser.parse('::FullScreenImage{src="/bg.png" overlay="0.4"}\n# Title\n::')
    expect(slide!.layout?.media).toMatchObject({ placement: 'behind', src: '/bg.png', veil: 0.4 })
    expect(slide!.header).toBeDefined()
  })

  it('hides the slide heading on request', async () => {
    const [slide] = await headingParser.parse('### Title\n\n::FullScreenImage{src="/bg.png" heading="print"}\n::')
    expect(slide!.layout?.heading).toBe('print')
  })

  it('ignores an unknown heading value', async () => {
    const [slide] = await headingParser.parse('### Title\n\n::FullScreenImage{src="/bg.png" heading="none"}\n::')
    expect(slide!.layout?.heading).toBeUndefined()
  })

  it('leaves a slide without one to its theme background', async () => {
    const [slide] = await headingParser.parse('## Title\n\nText')
    expect(slide!.backgroundImage).toBeUndefined()
    expect(slide!.layout).toBeUndefined()
  })
})

describe('slide layouts', () => {
  it('splits the heading from the body beside a media, and names the layout in the classes', async () => {
    const [slide] = await headingParser.parse('### Title\n\n:layout{media="left" size="2/3" src="/a.png"}\n\nText')
    expect(slide!.header).toBeDefined()
    expect(slide!.layout?.media).toMatchObject({ placement: 'left', size: '2/3', src: '/a.png' })
    expect(getSlideClasses(slide!)).toEqual(['slide-h3', 'layout-media', 'layout-media-left', 'media-size-2-3'])
  })

  it('names a media behind the text and its card or veil in the classes', async () => {
    const [card] = await headingParser.parse('### Title\n\n:layout{media="behind" src="/a.jpg"}')
    const [veil] = await headingParser.parse('### Title\n\n:layout{media="behind" src="/a.jpg" veil="40%"}')
    expect(getSlideClasses(card!)).toEqual(['slide-h3', 'layout-media', 'layout-media-behind', 'media-card'])
    expect(getSlideClasses(veil!)).toEqual(['slide-h3', 'layout-media', 'layout-media-behind', 'media-veil'])
  })

  it('names the text step and the tight inset in the classes, and no class for md', async () => {
    const [small] = await headingParser.parse('### Title\n\n:layout{text="sm" inset="tight"}\n\nText')
    expect(getSlideClasses(small!)).toEqual(['slide-h3', 'text-size-sm', 'inset-tight'])
    const [normal] = await headingParser.parse('### Title\n\n:layout{text="md"}\n\nText')
    expect(getSlideClasses(normal!)).toEqual(['slide-h3'])
  })

  it('names the heading mode in the classes', async () => {
    const [slide] = await headingParser.parse('### Title\n\n:layout{heading="compact"}\n\nText')
    expect(getSlideClasses(slide!)).toEqual(['slide-h3', 'heading-compact'])
  })

  it('names a screen slide in the classes, with a compact heading unless it names another', async () => {
    const [screen] = await headingParser.parse('### Title\n\n:layout{screen}\n\nText')
    const [hidden] = await headingParser.parse('### Title\n\n:layout{screen heading="hidden"}\n\nText')
    expect(getSlideClasses(screen!)).toEqual(['slide-h3', 'layout-screen', 'heading-compact'])
    expect(getSlideClasses(hidden!)).toEqual(['slide-h3', 'layout-screen', 'heading-hidden'])
  })

  it('names the vertical alignment in the classes', async () => {
    const [slide] = await headingParser.parse('### Title\n\n:layout{align="top"}\n\nText')
    expect(getSlideClasses(slide!)).toEqual(['slide-h3', 'align-top'])
  })

  it('drops an unknown name and places the source on the right', async () => {
    const [slide] = await headingParser.parse('### Title\n\n:layout{name="media-rigth" src="/a.png"}\n\nText')
    expect(getSlideClasses(slide!)).toEqual(['slide-h3', 'layout-media', 'layout-media-right', 'media-size-1-2'])
  })

  it('keeps the heading of a slide that names the full layout of the earlier format', async () => {
    const [slide] = await headingParser.parse('### Title\n\n:layout{name="full"}\n\nText')
    expect(slide!.header).toBeDefined()
    expect(slide!.fullSlide).toBeUndefined()
  })

  it('places the text of a split slide of the earlier format beside its media', async () => {
    const [slide] = await headingParser.parse('### Title\n\n::SplitSlide{src="/a.png" type="image" ratio="1:1"}\nThe text.\n::')
    expect(slide!.layout?.media).toMatchObject({ placement: 'right', size: '1/2', src: '/a.png', type: 'image' })
    expect(JSON.stringify(slide!.body)).toContain('The text.')
    expect(JSON.stringify(slide!.body)).not.toContain('SplitSlide')
  })
})

describe('section slides', () => {
  const sectionOf = async (raw: string) => (await headingParser.parse(raw)).map(slide => slide.section ?? false)

  it('marks the ## slide of a vertical stack and leaves its ### slides', async () => {
    const [stack] = await headingParser.parse('## Part one\n\n### First point\n\nSome text.')
    expect(stack!.verticalSlides!.map(slide => slide.section ?? false)).toEqual([true, false])
  })

  it('tags a section slide-h2 and a ## slide with content slide-h3', async () => {
    const slides = await headingParser.parse('## Part one\n\n## A list\n\n- One point')
    expect(slides.map(slide => getSlideClasses(slide))).toEqual([['slide-h2'], ['slide-h3']])
  })

  it('leaves the other heading levels', async () => {
    expect(await sectionOf('# Title')).toEqual([false])
    expect(await sectionOf('### Alone')).toEqual([false])
  })
})

describe('slideKeys', () => {
  it('keys apart two slides of the same text, which share one parsed object', () => {
    const repeated = { key: 'questions' } as Slide
    expect(slideKeys([repeated, { key: 'suite' } as Slide, repeated]).sections).toEqual(['questions', 'suite', 'questions~1'])
  })
})
