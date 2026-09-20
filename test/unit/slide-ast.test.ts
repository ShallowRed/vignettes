import { headingParser } from '@vignettes/nuxt/runtime/utils/slide-ast.ts'
import { describe, expect, it } from 'vitest'

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
