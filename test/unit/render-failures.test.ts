import type { Slide } from '@vignettes/core/deck'
import { describe, expect, it } from 'vitest'
import { renderFailureMentions } from '../../layers/studio/src/utils/render-failures'

describe('renderFailureMentions', () => {
  it('places a failure on the component of its rank in its slide, and on the first line of the slide without one', () => {
    const text = '# Titre\n\n---\n\n## Icônes\n\n:i{name="a"} et :i\n'
    const slides: Slide[] = [{ body: null }, { body: null }]
    const failure = { names: ['i', 'IconInline'], index: 1 }
    expect(renderFailureMentions(text, 'mdc', slides, [{ ...failure, slide: slides[1]! }])).toEqual([
      { name: 'i', line: 7, column: 16, length: 2 },
    ])
    expect(renderFailureMentions(text, 'mdc', slides, [{ ...failure, slide: slides[0]! }])).toEqual([
      { name: 'i', line: 1, column: 0, length: 7 },
    ])
  })
})
