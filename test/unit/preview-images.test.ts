import { valueMentions } from '@vignettes/core/deck'
import { describe, expect, it } from 'vitest'
import { imageMention } from '../../layers/studio/src/utils/preview-images'

const DECK = '---\ntitle: T\n---\n\n## Un\n\n![Logo](/images/logo.png)\n\n---\n\n## Deux\n\n[Télécharger](/images/logo.png)\n::Image{src="/images/logo.png"}\n::\n\n```md\n![Logo](/images/code.png)\n```\n'
const mentions = valueMentions(DECK)
function place(src: string, from: number) {
  const mention = imageMention(mentions, src, from)
  return mention && [mention.line, mention.column]
}

describe('imageMention', () => {
  it('finds the image address from the slide on screen on, past a link to it, else before it', () => {
    expect(place('/images/logo.png', 11)).toEqual([14, 8])
    expect(place('/images/logo.png', 5)).toEqual([7, 8])
    expect(place('/images/logo.png', 16)).toEqual([7, 8])
  })

  it('finds an address the render rewrites by its file name, and leaves an address the source lacks or writes in code', () => {
    expect(place('https://studio.example/images/logo.png?v=2', 11)).toEqual([14, 8])
    expect(place('/backgrounds/fond.svg', 11)).toBeUndefined()
    expect(place('/images/code.png', 11)).toBeUndefined()
  })
})
